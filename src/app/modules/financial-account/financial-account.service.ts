import { Types } from "mongoose";
import AppError from "../../errorHelpers/appError";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { FinancialAccount } from "./financial-account.model";
import { IFinancialAccount } from "./financial-account.interface";
import { FINANCIAL_ACCOUNT_SEARCHABLE_FIELDS } from "./financial-account.constant";
import { User } from "../user/user.model";

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
const ownerPopulate = { path: "ownerId", select: "firstName lastName email designation" };

const assertOwnerExists = async (ownerId?: string | null) => {
  if (!ownerId) return;
  const owner = await User.findOne({ _id: ownerId, isDeleted: false });
  if (!owner) {
    throw new AppError(404, "Owner (user) not found");
  }
};



const createFinancialAccount = async (
  payload: Partial<IFinancialAccount>,
  userId: string,
) => {
  await assertOwnerExists(payload.ownerId?.toString());

  const result = await FinancialAccount.create({
    ...payload,
    currentBalance: payload.openingBalance ?? 0, // ⬅️ যোগ করুন
    createdBy: userId,
  });
  return result;
};
const getAllFinancialAccounts = async (query: Record<string, unknown>) => {
  // const baseQuery = FinancialAccount.find({ isDeleted: false });
  const baseQuery = FinancialAccount.find({ isDeleted: false }).populate(ownerPopulate);


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
  // const account = await FinancialAccount.findOne({ _id: id, isDeleted: false });
 const account = await FinancialAccount.findOne({ _id: id, isDeleted: false }).populate(ownerPopulate);
 
  
  if (!account) {
    throw new AppError(404, "Financial account not found");
  }
  return account;
};

const getFinancialAccountSummary = async () => {
  const accounts = await FinancialAccount.find({ isDeleted: false }).populate(ownerPopulate);

  const totalOpeningBalance = accounts.reduce((sum, acc) => sum + acc.openingBalance, 0);
  const totalCurrentBalance = accounts.reduce((sum, acc) => sum + acc.currentBalance, 0);

const ownerMap = new Map<
  string,
  {
    ownerId: string | null;
    ownerName: string;
    accountCount: number;
    totalBalance: number;
  }
>();

  for (const acc of accounts) {
    const owner = acc.ownerId as unknown as
      | { _id: { toString(): string }; firstName?: string; lastName?: string }
      | null;

    const key = owner?._id.toString() ?? "unassigned";
    const existing = ownerMap.get(key) ?? {
      ownerId: owner ? owner._id.toString() : null,
      ownerName: owner ? `${owner.firstName ?? ""} ${owner.lastName ?? ""}`.trim() : "Unassigned",
      accountCount: 0,
      totalBalance: 0,
    };

    existing.accountCount += 1;
    existing.totalBalance += acc.currentBalance;
    ownerMap.set(key, existing);
  }

  return {
    totalAccounts: accounts.length,
    totalOpeningBalance,
    totalCurrentBalance,
    totalSpent: totalOpeningBalance - totalCurrentBalance,
    byOwner: Array.from(ownerMap.values()),
    accounts: accounts.map((acc) => ({
      _id: acc._id,
      accountName: acc.accountName,
      accountType: acc.accountType,
      openingBalance: acc.openingBalance,
      currentBalance: acc.currentBalance,
      ownerId: acc.ownerId,
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

  await assertOwnerExists(payload.ownerId?.toString());

  // balance এখানে সরাসরি বদলানো যাবে না, ওটা শুধু expense/payment/transfer দিয়ে বদলায়
  const { currentBalance, ...safePayload } = payload;

  const result = await FinancialAccount.findByIdAndUpdate(
    id,
    { ...safePayload, updatedBy: userId },
    { new: true, runValidators: true },
  ).populate(ownerPopulate);

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