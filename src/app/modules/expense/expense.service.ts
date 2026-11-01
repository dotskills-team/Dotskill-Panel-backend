
import AppError from "../../errorHelpers/appError";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { Expense } from "./expense.model";
import { IExpense } from "./expense.interface";
import { EXPENSE_SEARCHABLE_FIELDS } from "./expense.constant";
import { FinancialAccount } from "../financial-account/financial-account.model";
import { ExpenseCategory } from "../expense-category/expense-category.model";
import mongoose from "mongoose";
import { applyAccountChange } from "../transaction/ledger.service";
import { TRANSACTION_TYPE } from "../transaction/transaction.constant";
import { FinanceActor, isFinanceAdmin } from "../../utils/financeScope";

/** Every user, admins included, may only spend from a financial account they own. */
const assertCanUseAccount = async (
  accountId: mongoose.Types.ObjectId | string | undefined,
  actor: FinanceActor,
  session: mongoose.ClientSession,
) => {
  const owned = await FinancialAccount.exists({
    _id: accountId,
    ownerId: actor.userId,
    isDeleted: false,
  }).session(session);

  if (!owned) {
    throw new AppError(
      403,
      "You can only create or move expenses using your own financial account.",
    );
  }
};

const EXPENSE_DATE_FIELD = "expenseDate";

const getDayBoundariesUTC = (dateStr: string) => {
  const d = new Date(dateStr);

  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );

  const end = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );

  return { start, end };
};

const buildDateRangeFilter = (
  startDateStr?: string,
  endDateStr?: string,
): { $gte: Date; $lte: Date } | null => {
  if (startDateStr && endDateStr) {
    return {
      $gte: getDayBoundariesUTC(startDateStr).start,
      $lte: getDayBoundariesUTC(endDateStr).end,
    };
  }

  const single = startDateStr || endDateStr;

  if (single) {
    const { start, end } = getDayBoundariesUTC(single);
    return { $gte: start, $lte: end };
  }

  return null;
};

const buildDateFilter = (query: Record<string, string>) => {
  const startDateStr = query["startDate"];
  const endDateStr = query["endDate"];

  delete query.startDate;
  delete query.endDate;

  const range = buildDateRangeFilter(startDateStr, endDateStr);

  return range ? { [EXPENSE_DATE_FIELD]: range } : {};
};

const createExpense = async (payload: Partial<IExpense>, actor: FinanceActor) => {
  const userId = actor.userId;
  const session = await mongoose.startSession();
  try {
    let result;

    await session.withTransaction(async () => {
      const category = await ExpenseCategory.findOne({
        _id: payload.categoryId,
        isDeleted: false,
      }).session(session);
      if (!category) throw new AppError(404, "Expense category not found");

      await assertCanUseAccount(payload.financialAccountId, actor, session);

      const amount = Number(payload.amount ?? 0);

      const [expense] = await Expense.create(
        [{ ...payload, createdBy: userId }],
        { session },
      );

      await applyAccountChange({
        accountId: payload.financialAccountId as unknown as string,
        amount: -amount,
        type: TRANSACTION_TYPE.EXPENSE,
        date: payload.expenseDate,
        note: payload.description,
        refModel: "Expense",
        refId: expense._id,
        userId,
        session,
        requireActive: true,
      });

      result = expense;
    });

    return result;
  } finally {
    await session.endSession();
  }
};

// Admins see every expense; everyone else sees only the expenses they created.
// `mineOnly` narrows the list to the caller's own expenses, even for admins.
const expenseScope = (actor: FinanceActor, mineOnly = false) =>
  mineOnly || !isFinanceAdmin(actor.role) ? { createdBy: actor.userId } : {};

const creatorPopulate = { path: "createdBy", select: "firstName lastName email role" };

const getAllExpenses = async (query: Record<string, unknown>, actor: FinanceActor) => {
  const cleanQuery = { ...(query as Record<string, string>) };
  const mineOnly = cleanQuery.mine === "true";
  delete cleanQuery.mine; // not a model field; must not reach the QueryBuilder filter
  const dateFilterObj = buildDateFilter(cleanQuery);

  // $and keeps the scope even if the query string tries to override createdBy or isDeleted.
  const baseQuery = Expense.find({
    $and: [
      { isDeleted: false },
      dateFilterObj,
      expenseScope(actor, mineOnly),
    ],
  })
    .populate("categoryId", "name")
    .populate("financialAccountId", "accountName accountType ownerId")
    .populate(creatorPopulate);

  const queryBuilder = new QueryBuilder(baseQuery, cleanQuery)
    .search(EXPENSE_SEARCHABLE_FIELDS)
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await queryBuilder.modelQuery;
  const meta = await queryBuilder.getMeta();

  return { result, meta };
};

const getSingleExpense = async (id: string, actor: FinanceActor) => {
  const expense = await Expense.findOne({
    _id: id,
    isDeleted: false,
    ...expenseScope(actor),
  })
    .populate("categoryId", "name")
    .populate("financialAccountId", "accountName accountType ownerId")
    .populate(creatorPopulate);

  if (!expense) {
    throw new AppError(404, "Expense not found");
  }
  return expense;
};

const updateExpense = async (
  id: string,
  payload: Partial<IExpense>,
  actor: FinanceActor,
) => {
  const userId = actor.userId;
  const session = await mongoose.startSession();
  try {
    let result;

    await session.withTransaction(async () => {
      const expense = await Expense.findOne({
        _id: id,
        isDeleted: false,
        ...expenseScope(actor),
      }).session(session);
      if (!expense) throw new AppError(404, "Expense not found");

      // Only re-check ownership when the account actually changes (the edit form
      // always resends the current account).
      if (
        payload.financialAccountId &&
        payload.financialAccountId.toString() !== expense.financialAccountId.toString()
      ) {
        await assertCanUseAccount(payload.financialAccountId, actor, session);
      }

      if (payload.categoryId) {
        const category = await ExpenseCategory.findOne({
          _id: payload.categoryId,
          isDeleted: false,
        }).session(session);
        if (!category) throw new AppError(404, "Expense category not found");
      }

      const oldAccountId = expense.financialAccountId.toString();
      const oldAmount = expense.amount;
      const newAccountId =
        payload.financialAccountId?.toString() ?? oldAccountId;
      const newAmount = Number(payload.amount ?? oldAmount);

      const base = {
        type: TRANSACTION_TYPE.EXPENSE,
        refModel: "Expense",
        refId: expense._id,
        userId,
        session,
      };

      if (oldAccountId === newAccountId) {
        const diff = newAmount - oldAmount;
        if (diff !== 0) {
          await applyAccountChange({
            ...base,
            accountId: newAccountId,
            amount: -diff,
            isReversal: diff < 0,
            note: "Expense amount updated",
          });
        }
      } else {
        await applyAccountChange({
          ...base,
          accountId: oldAccountId,
          amount: oldAmount,
          isReversal: true,
          note: "Expense moved to another account",
        });
        await applyAccountChange({
          ...base,
          accountId: newAccountId,
          amount: -newAmount,
          requireActive: true,
          note: "Expense moved from another account",
        });
      }

      result = await Expense.findByIdAndUpdate(
        id,
        { ...payload, updatedBy: userId },
        { new: true, runValidators: true, session },
      );
    });

    return result;
  } finally {
    await session.endSession();
  }
};

const deleteExpense = async (id: string, userId: string) => {
  const session = await mongoose.startSession();
  try {
    let result;

    await session.withTransaction(async () => {
      const expense = await Expense.findOne({
        _id: id,
        isDeleted: false,
      }).session(session);
      if (!expense) throw new AppError(404, "Expense not found");

      await applyAccountChange({
        accountId: expense.financialAccountId,
        amount: expense.amount,
        type: TRANSACTION_TYPE.EXPENSE,
        isReversal: true,
        note: "Expense deleted",
        refModel: "Expense",
        refId: expense._id,
        userId,
        session,
      });

      result = await Expense.findByIdAndUpdate(
        id,
        { isDeleted: true, deletedBy: userId, deletedAt: new Date() },
        { new: true, session },
      );
    });

    return result;
  } finally {
    await session.endSession();
  }
};

/**
 * Totals for the expense stats cards. Uses the same scope as the list:
 * everyone gets their own expenses, admins get all of them unless `mine=true`.
 */
const getExpenseSummary = async (query: Record<string, unknown>, actor: FinanceActor) => {
  const mineOnly = query.mine === "true" || query.mine === true;

  const match: Record<string, unknown> = { isDeleted: false };
  if (mineOnly || !isFinanceAdmin(actor.role)) {
    match.createdBy = new mongoose.Types.ObjectId(actor.userId);
  }

  // Same date filter as the list (startDate / endDate, YYYY-MM-DD).
  const dateFilter = buildDateRangeFilter(
    typeof query.startDate === "string" ? query.startDate : undefined,
    typeof query.endDate === "string" ? query.endDate : undefined,
  );
  if (dateFilter) match.expenseDate = dateFilter;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [agg] = await Expense.aggregate([
    { $match: match },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalAmount: { $sum: "$amount" },
              totalCount: { $sum: 1 },
              largestAmount: { $max: "$amount" },
              latestExpenseDate: { $max: "$expenseDate" },
              accountIds: { $addToSet: "$financialAccountId" },
            },
          },
          {
            $project: {
              _id: 0,
              totalAmount: 1,
              totalCount: 1,
              largestAmount: 1,
              latestExpenseDate: 1,
              accountsUsed: { $size: "$accountIds" },
            },
          },
        ],
        thisMonth: [
          { $match: { expenseDate: { $gte: monthStart } } },
          { $group: { _id: null, amount: { $sum: "$amount" }, count: { $sum: 1 } } },
        ],
        topCategories: [
          { $group: { _id: "$categoryId", amount: { $sum: "$amount" }, count: { $sum: 1 } } },
          { $sort: { amount: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: "expensecategories",
              localField: "_id",
              foreignField: "_id",
              as: "category",
            },
          },
          { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              name: { $ifNull: ["$category.name", "Unknown"] },
              amount: 1,
              count: 1,
            },
          },
        ],
      },
    },
  ]);

  const totals = agg?.totals?.[0] ?? {};
  const month = agg?.thisMonth?.[0] ?? {};
  const totalAmount: number = totals.totalAmount ?? 0;
  const totalCount: number = totals.totalCount ?? 0;

  return {
    totalAmount,
    totalCount,
    averageAmount: totalCount ? totalAmount / totalCount : 0,
    largestAmount: totals.largestAmount ?? 0,
    latestExpenseDate: totals.latestExpenseDate ?? null,
    accountsUsed: totals.accountsUsed ?? 0,
    thisMonthAmount: month.amount ?? 0,
    thisMonthCount: month.count ?? 0,
    topCategories: agg?.topCategories ?? [],
  };
};

export const ExpenseService = {
  createExpense,
  getAllExpenses,
  getSingleExpense,
  getExpenseSummary,
  updateExpense,
  deleteExpense,
};