import mongoose from "mongoose";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { Transaction } from "./transaction.model";
import { applyAccountChange } from "./ledger.service";
import {
  TRANSACTION_SEARCHABLE_FIELDS,
  TRANSACTION_TYPE,
} from "./transaction.constant";
import { FinancialAccount } from "../financial-account/financial-account.model";

const deposit = async (
  payload: { accountId: string; amount: number; date: string; note?: string },
  userId: string,
) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await applyAccountChange({
        accountId: payload.accountId,
        amount: payload.amount,
        type: TRANSACTION_TYPE.DEPOSIT,
        date: payload.date,
        note: payload.note,
        userId,
        session,
        requireActive: true,
      });
    });
  } finally {
    await session.endSession();
  }

  return FinancialAccount.findById(payload.accountId);
};

const getAllTransactions = async (query: Record<string, unknown>) => {
  const baseQuery = Transaction.find({})
    .populate("accountId", "accountName accountType")
    .populate("createdBy", "firstName lastName");

  const queryBuilder = new QueryBuilder(
    baseQuery,
    query as Record<string, string>,
  )
    .search(TRANSACTION_SEARCHABLE_FIELDS)
    .filter()
    .sort()
    .paginate()
    .fields();

  const result = await queryBuilder.modelQuery;
  const meta = await queryBuilder.getMeta();
  return { result, meta };
};

export const TransactionService = { deposit, getAllTransactions };