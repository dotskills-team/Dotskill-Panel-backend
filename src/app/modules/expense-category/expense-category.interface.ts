import { Types } from "mongoose";
import { CATEGORY_STATUS } from "./expense-category.constant";

export type CategoryStatus = (typeof CATEGORY_STATUS)[keyof typeof CATEGORY_STATUS];

export interface IExpenseCategory {
  _id?: Types.ObjectId;

  name: string;
  description?: string;
  status: CategoryStatus;

  createdBy?: Types.ObjectId | null;
  updatedBy?: Types.ObjectId | null;
  deletedBy?: Types.ObjectId | null;
  deletedAt?: Date | null;
  isDeleted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}