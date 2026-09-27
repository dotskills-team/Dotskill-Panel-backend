import AppError from "../../errorHelpers/appError";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { Expense } from "./expense.model";
import { IExpense } from "./expense.interface";
import { EXPENSE_SEARCHABLE_FIELDS } from "./expense.constant";
import { FinancialAccount } from "../financial-account/financial-account.model";
import { ExpenseCategory } from "../expense-category/expense-category.model";

const createExpense = async (payload: Partial<IExpense>, userId: string) => {
  const account = await FinancialAccount.findOne({
    _id: payload.financialAccountId,
    isDeleted: false,
  });
  if (!account) {
    throw new AppError(404, "Financial account not found");
  }

  const category = await ExpenseCategory.findOne({
    _id: payload.categoryId,
    isDeleted: false,
  });
  if (!category) {
    throw new AppError(404, "Expense category not found");
  }

  const amount = payload.amount ?? 0;

  if (account.currentBalance < amount) {
    throw new AppError(
      400,
      `Insufficient balance in "${account.accountName}". Available: ${account.currentBalance}`,
    );
  }

  const result = await Expense.create({ ...payload, createdBy: userId });

  await FinancialAccount.findByIdAndUpdate(payload.financialAccountId, {
    $inc: { currentBalance: -amount },
  });

  return result;
};

const getAllExpenses = async (query: Record<string, unknown>) => {
  const baseQuery = Expense.find({ isDeleted: false })
    .populate("categoryId", "name")
    .populate("financialAccountId", "accountName accountType");

  const queryBuilder = new QueryBuilder(baseQuery, query as Record<string, string>)
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
  const expense = await Expense.findOne({ _id: id, isDeleted: false });
  if (!expense) {
    throw new AppError(404, "Expense not found");
  }

  const newAccountId =
    payload.financialAccountId?.toString() ?? expense.financialAccountId.toString();
  const newAmount = payload.amount ?? expense.amount;

  if (payload.financialAccountId) {
    const account = await FinancialAccount.findOne({
      _id: payload.financialAccountId,
      isDeleted: false,
    });
    if (!account) {
      throw new AppError(404, "Financial account not found");
    }
  }

  if (payload.categoryId) {
    const category = await ExpenseCategory.findOne({
      _id: payload.categoryId,
      isDeleted: false,
    });
    if (!category) {
      throw new AppError(404, "Expense category not found");
    }
  }

  const oldAccountId = expense.financialAccountId.toString();
  const oldAmount = expense.amount;

  if (oldAccountId === newAccountId) {
    const diff = newAmount - oldAmount;
    const account = await FinancialAccount.findById(newAccountId);
    if (account && account.currentBalance < diff) {
      throw new AppError(
        400,
        `Insufficient balance in "${account.accountName}" for this update.`,
      );
    }
    await FinancialAccount.findByIdAndUpdate(newAccountId, {
      $inc: { currentBalance: -diff },
    });
  } else {
    const newAccount = await FinancialAccount.findById(newAccountId);
    if (newAccount && newAccount.currentBalance < newAmount) {
      throw new AppError(
        400,
        `Insufficient balance in "${newAccount.accountName}" for this update.`,
      );
    }
    await FinancialAccount.findByIdAndUpdate(oldAccountId, {
      $inc: { currentBalance: oldAmount },
    });
    await FinancialAccount.findByIdAndUpdate(newAccountId, {
      $inc: { currentBalance: -newAmount },
    });
  }

  const result = await Expense.findByIdAndUpdate(
    id,
    { ...payload, updatedBy: userId },
    { new: true, runValidators: true },
  );

  return result;
};

const deleteExpense = async (id: string, userId: string) => {
  const expense = await Expense.findOne({ _id: id, isDeleted: false });
  if (!expense) {
    throw new AppError(404, "Expense not found");
  }

  const result = await Expense.findByIdAndUpdate(
    id,
    { isDeleted: true, deletedBy: userId, deletedAt: new Date() },
    { new: true },
  );

  await FinancialAccount.findByIdAndUpdate(expense.financialAccountId, {
    $inc: { currentBalance: expense.amount },
  });

  return result;
};

export const ExpenseService = {
  createExpense,
  getAllExpenses,
  getSingleExpense,
  updateExpense,
  deleteExpense,
};