import { Types } from "mongoose";
import { TransactionType } from "./transaction.constant";

export interface ITransaction {
  _id?: Types.ObjectId;
  accountId: Types.ObjectId;
  direction: "IN" | "OUT";
  type: TransactionType;
  amount: number; // সবসময় ধনাত্মক
  balanceAfter: number;
  date: Date;
  note?: string;
  isReversal: boolean;
  refModel?: string;
  refId?: Types.ObjectId;
  loanId?: Types.ObjectId;
  createdBy?: Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}