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

  const result = await Expense.create({ ...payload, createdBy: userId });
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

  return result;
};

export const ExpenseService = {
  createExpense,
  getAllExpenses,
  getSingleExpense,
  updateExpense,
  deleteExpense,
};