import { ClientSession, Types } from "mongoose";
import AppError from "../../errorHelpers/appError";
import { FinancialAccount } from "../financial-account/financial-account.model";
import { Transaction } from "./transaction.model";
import { TransactionType } from "./transaction.constant";

interface ApplyChangeParams {
  accountId: string | Types.ObjectId;
  /** ধনাত্মক = টাকা ঢুকবে, ঋণাত্মক = টাকা বেরোবে */
  amount: number;
  type: TransactionType;
  session: ClientSession;
  userId?: string;
  date?: Date | string;
  note?: string;
  refModel?: string;
  refId?: Types.ObjectId | string;
  loanId?: Types.ObjectId | string;
  isReversal?: boolean;
  /** true হলে INACTIVE account থেকে/এ লেনদেন আটকাবে */
  requireActive?: boolean;
}

export const applyAccountChange = async (p: ApplyChangeParams) => {
  const amount = Number(p.amount);
  if (!amount) return null;

  const account = await FinancialAccount.findOneAndUpdate(
    {
      _id: p.accountId,
      isDeleted: false,
      ...(p.requireActive ? { status: "ACTIVE" } : {}),
      ...(amount < 0 ? { currentBalance: { $gte: -amount } } : {}),
    },
    { $inc: { currentBalance: amount } },
    { new: true, session: p.session },
  );

  if (!account) {
    const exists = await FinancialAccount.findOne({
      _id: p.accountId,
      isDeleted: false,
    }).session(p.session);

    throw new AppError(
      exists ? 400 : 404,
      exists
        ? "Insufficient balance in the selected account (or account is inactive)."
        : "Financial account not found.",
    );
  }

  await Transaction.create(
    [
      {
        accountId: account._id,
        direction: amount > 0 ? "IN" : "OUT",
        type: p.type,
        amount: Math.abs(amount),
        balanceAfter: account.currentBalance,
        date: p.date ? new Date(p.date) : new Date(),
        note: p.note ?? "",
        isReversal: Boolean(p.isReversal),
        refModel: p.refModel,
        refId: p.refId ? new Types.ObjectId(String(p.refId)) : undefined,
        loanId: p.loanId ? new Types.ObjectId(String(p.loanId)) : undefined,
        createdBy: p.userId ? new Types.ObjectId(p.userId) : null,
      },
    ],
    { session: p.session },
  );

  return account;
};