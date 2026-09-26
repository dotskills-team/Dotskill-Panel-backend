import AppError from "../../errorHelpers/appError";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { ExpenseCategory } from "./expense-category.model";
import { IExpenseCategory } from "./expense-category.interface";
import { EXPENSE_CATEGORY_SEARCHABLE_FIELDS } from "./expense-category.constant";

const createExpenseCategory = async (
  payload: Partial<IExpenseCategory>,
  userId: string,
) => {
  const exists = await ExpenseCategory.findOne({
    name: payload.name,
    isDeleted: false,
  });
  if (exists) {
    throw new AppError(400, "Category with this name already exists");
  }

  const result = await ExpenseCategory.create({ ...payload, createdBy: userId });
  return result;
};

const getAllExpenseCategories = async (query: Record<string, unknown>) => {
  const baseQuery = ExpenseCategory.find({ isDeleted: false });

  const queryBuilder = new QueryBuilder(baseQuery, query as Record<string, string>)
    .search(EXPENSE_CATEGORY_SEARCHABLE_FIELDS)
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await queryBuilder.modelQuery;
  const meta = await queryBuilder.getMeta();

  return { result, meta };
};

const getSingleExpenseCategory = async (id: string) => {
  const category = await ExpenseCategory.findOne({ _id: id, isDeleted: false });
  if (!category) {
    throw new AppError(404, "Expense category not found");
  }
  return category;
};

const updateExpenseCategory = async (
  id: string,
  payload: Partial<IExpenseCategory>,
  userId: string,
) => {
  const category = await ExpenseCategory.findOne({ _id: id, isDeleted: false });
  if (!category) {
    throw new AppError(404, "Expense category not found");
  }

  const result = await ExpenseCategory.findByIdAndUpdate(
    id,
    { ...payload, updatedBy: userId },
    { new: true, runValidators: true },
  );

  return result;
};

const deleteExpenseCategory = async (id: string, userId: string) => {
  const category = await ExpenseCategory.findOne({ _id: id, isDeleted: false });
  if (!category) {
    throw new AppError(404, "Expense category not found");
  }

  const result = await ExpenseCategory.findByIdAndUpdate(
    id,
    { isDeleted: true, deletedBy: userId, deletedAt: new Date() },
    { new: true },
  );

  return result;
};

export const ExpenseCategoryService = {
  createExpenseCategory,
  getAllExpenseCategories,
  getSingleExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
};