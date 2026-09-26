import { model, Schema } from "mongoose";
import { IExpense } from "./expense.interface";

const expenseSchema = new Schema<IExpense>(
  {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "ExpenseCategory",
      required: true,
      index: true,
    },

    financialAccountId: {
      type: Schema.Types.ObjectId,
      ref: "FinancialAccount",
      required: true,
      index: true,
    },

    expenseDate: {
      type: Date,
      required: true,
      index: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    reference: {
      type: String,
      trim: true,
      default: "",
    },

    attachment: {
      type: String,
      default: null,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

expenseSchema.index({ isDeleted: 1, expenseDate: -1 });
expenseSchema.index({ categoryId: 1, financialAccountId: 1 });

export const Expense = model<IExpense>("Expense", expenseSchema);