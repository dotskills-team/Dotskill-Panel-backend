
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

const createExpense = async (payload: Partial<IExpense>, userId: string) => {
  const session = await mongoose.startSession();
  try {
    let result;

    await session.withTransaction(async () => {
      const category = await ExpenseCategory.findOne({
        _id: payload.categoryId,
        isDeleted: false,
      }).session(session);
      if (!category) throw new AppError(404, "Expense category not found");

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

const getAllExpenses = async (query: Record<string, unknown>) => {
  const cleanQuery = { ...(query as Record<string, string>) };
  const dateFilterObj = buildDateFilter(cleanQuery);

  const baseQuery = Expense.find({
    isDeleted: false,
    ...dateFilterObj,
  })
    .populate("categoryId", "name")
    .populate("financialAccountId", "accountName accountType");

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

const getSingleExpense = async (id: string) => {
  const expense = await Expense.findOne({ _id: id, isDeleted: false })
    .populate("categoryId", "name")
    .populate("financialAccountId", "accountName accountType");

  if (!expense) {
    throw new AppError(404, "Expense not found");
  }
  return expense;
};

const updateExpense = async (
  id: string,
  payload: Partial<IExpense>,
  userId: string,
) => {
  const session = await mongoose.startSession();
  try {
    let result;

    await session.withTransaction(async () => {
      const expense = await Expense.findOne({
        _id: id,
        isDeleted: false,
      }).session(session);
      if (!expense) throw new AppError(404, "Expense not found");

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

export const ExpenseService = {
  createExpense,
  getAllExpenses,
  getSingleExpense,
  updateExpense,
  deleteExpense,
};