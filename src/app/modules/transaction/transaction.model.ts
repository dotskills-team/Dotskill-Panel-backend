import { model, Schema } from "mongoose";
import { ITransaction } from "./transaction.interface";
import { TRANSACTION_TYPE } from "./transaction.constant";

const transactionSchema = new Schema<ITransaction>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "FinancialAccount",
      required: true,
      index: true,
    },
    direction: { type: String, enum: ["IN", "OUT"], required: true },
    type: {
      type: String,
      enum: Object.values(TRANSACTION_TYPE),
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true },
    date: { type: Date, required: true, default: Date.now, index: true },
    note: { type: String, trim: true, default: "" },
    isReversal: { type: Boolean, default: false },
    refModel: { type: String },
    refId: { type: Schema.Types.ObjectId },
    loanId: { type: Schema.Types.ObjectId, ref: "Loan", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, versionKey: false },
);

transactionSchema.index({ accountId: 1, date: -1 });

export const Transaction = model<ITransaction>("Transaction", transactionSchema);