import { Types } from "mongoose";
import { ACCOUNT_TYPE, ACCOUNT_STATUS, PROVIDER_NAME } from "./financial-account.constant";

export type AccountType = (typeof ACCOUNT_TYPE)[keyof typeof ACCOUNT_TYPE];
export type ProviderName = (typeof PROVIDER_NAME)[keyof typeof PROVIDER_NAME];
export type AccountStatus = (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];

export interface IFinancialAccount {
  _id?: Types.ObjectId;

  // Basic Information
  accountName: string;
  accountType: AccountType;
  providerName?: ProviderName;
  accountNumber?: string;
  accountHolderName?: string;
ownerId?: Types.ObjectId | null;
  // Bank Information
  bankName?: string;
  branchName?: string;

  // Financial Information
  openingBalance: number;
    currentBalance: number; 

  currency: string;

  // Additional
  description?: string;
  status: AccountStatus;

  // Audit
  createdBy?: Types.ObjectId | null;
  updatedBy?: Types.ObjectId | null;
  deletedBy?: Types.ObjectId | null;
  deletedAt?: Date | null;
  isDeleted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}