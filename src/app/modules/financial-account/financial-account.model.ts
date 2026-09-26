import { model, Schema } from "mongoose";
import { IFinancialAccount } from "./financial-account.interface";
import { ACCOUNT_TYPE, ACCOUNT_STATUS, PROVIDER_NAME } from "./financial-account.constant";

const financialAccountSchema = new Schema<IFinancialAccount>(
  {
    accountName: {
      type: String,
      required: true,
      trim: true,
    },

    accountType: {
      type: String,
      enum: Object.values(ACCOUNT_TYPE),
      required: true,
      index: true,
    },

    providerName: {
      type: String,
      enum: Object.values(PROVIDER_NAME),
      default: null,
    },

    accountNumber: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },

    accountHolderName: {
      type: String,
      trim: true,
    },

    bankName: {
      type: String,
      trim: true,
    },

    branchName: {
      type: String,
      trim: true,
    },

    openingBalance: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    currency: {
      type: String,
      trim: true,
      default: "BDT",
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    status: {
      type: String,
      enum: Object.values(ACCOUNT_STATUS),
      default: ACCOUNT_STATUS.ACTIVE,
      index: true,
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

financialAccountSchema.index({ isDeleted: 1, status: 1 });
financialAccountSchema.index({ accountType: 1, status: 1 });

export const FinancialAccount = model<IFinancialAccount>(
  "FinancialAccount",
  financialAccountSchema,
);