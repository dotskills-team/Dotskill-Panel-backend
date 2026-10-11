import { model, Schema } from "mongoose";
import { ILoan } from "./loan.interface";

const loanSchema = new Schema<ILoan>(
  {
    lenderName: { type: String, required: true, trim: true },
    lenderPhone: { type: String, trim: true, default: "" },
    principalAmount: { type: Number, required: true, min: 1 },
    repaidAmount: { type: Number, required: true, default: 0, min: 0 },
    dueAmount: { type: Number, required: true, min: 0 },
    receivedAccountId: {
      type: Schema.Types.ObjectId,
      ref: "FinancialAccount",
      required: true,
    },
    receivedDate: { type: Date, required: true },
    dueDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ["ACTIVE", "PAID"],
      default: "ACTIVE",
      index: true,
    },
    note: { type: String, trim: true, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, versionKey: false },
);

export const Loan = model<ILoan>("Loan", loanSchema);