import { Types } from "mongoose";
import AppError from "../../errorHelpers/appError";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { FinancialAccount } from "./financial-account.model";
import { IFinancialAccount } from "./financial-account.interface";
import { FINANCIAL_ACCOUNT_SEARCHABLE_FIELDS } from "./financial-account.constant";

// const createFinancialAccount = async (
//   payload: Partial<IFinancialAccount>,
//   userId: string,
// ) => {
//   const result = await FinancialAccount.create({
//     ...payload,
//     createdBy: userId,
//   });
//   return result;
// };
const createFinancialAccount = async (
  payload: Partial<IFinancialAccount>,
  userId: string,
) => {
  const result = await FinancialAccount.create({
    ...payload,
    currentBalance: payload.openingBalance ?? 0, // ⬅️ যোগ করুন
    createdBy: userId,
  });
  return result;
};
const getAllFinancialAccounts = async (query: Record<string, unknown>) => {
  const baseQuery = FinancialAccount.find({ isDeleted: false });

  const queryBuilder = new QueryBuilder(baseQuery, query as Record<string, string>)
    .search(FINANCIAL_ACCOUNT_SEARCHABLE_FIELDS)
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await queryBuilder.modelQuery;
  const meta = await queryBuilder.getMeta();

  return { result, meta };
};

const getSingleFinancialAccount = async (id: string) => {
  const account = await FinancialAccount.findOne({ _id: id, isDeleted: false });
  if (!account) {
    throw new AppError(404, "Financial account not found");
  }
  return account;
};

const getFinancialAccountSummary = async () => {
  const accounts = await FinancialAccount.find({ isDeleted: false });

  const totalOpeningBalance = accounts.reduce(
    (sum, acc) => sum + acc.openingBalance,
    0,
  );
  const totalCurrentBalance = accounts.reduce(
    (sum, acc) => sum + acc.currentBalance,
    0,
  );
  const totalSpent = totalOpeningBalance - totalCurrentBalance;

  return {
    totalAccounts: accounts.length,
    totalOpeningBalance,
    totalCurrentBalance,
    totalSpent,
    accounts: accounts.map((acc) => ({
      _id: acc._id,
      accountName: acc.accountName,
      accountType: acc.accountType,
      openingBalance: acc.openingBalance,
      currentBalance: acc.currentBalance,
    })),
  };
};





const updateFinancialAccount = async (
  id: string,
  payload: Partial<IFinancialAccount>,
  userId: string,
) => {
  const account = await FinancialAccount.findOne({ _id: id, isDeleted: false });
  if (!account) {
    throw new AppError(404, "Financial account not found");
  }

  const result = await FinancialAccount.findByIdAndUpdate(
    id,
    { ...payload, updatedBy: userId },
    { new: true, runValidators: true },
  );

  return result;
};

const deleteFinancialAccount = async (id: string, userId: string) => {
  const account = await FinancialAccount.findOne({ _id: id, isDeleted: false });
  if (!account) {
    throw new AppError(404, "Financial account not found");
  }

  const result = await FinancialAccount.findByIdAndUpdate(
    id,
    {
      isDeleted: true,
      deletedBy: userId,
      deletedAt: new Date(),
    },
    { new: true },
  );

  return result;
};



export const FinancialAccountService = {
  createFinancialAccount,
  getAllFinancialAccounts,
  getSingleFinancialAccount,
  getFinancialAccountSummary,
  updateFinancialAccount,
  deleteFinancialAccount,
};