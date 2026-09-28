import { model, Schema } from "mongoose";
import { IFundTransfer } from "./fund-transfer.interface";

const fundTransferSchema = new Schema<IFundTransfer>(
  {
    fromAccountId: {
      type: Schema.Types.ObjectId,
      ref: "FinancialAccount",
      required: true,
      index: true,
    },
    toAccountId: {
      type: Schema.Types.ObjectId,
      ref: "FinancialAccount",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    transferDate: {
      type: Date,
      required: true,
      index: true,
    },
    reference: { type: String, trim: true, default: "" },
    note: { type: String, trim: true, default: "" },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    deletedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, versionKey: false },
);

fundTransferSchema.index({ isDeleted: 1, transferDate: -1 });

export const FundTransfer = model<IFundTransfer>("FundTransfer", fundTransferSchema);