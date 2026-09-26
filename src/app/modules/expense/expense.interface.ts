import { Types } from "mongoose";

export interface IExpense {
  _id?: Types.ObjectId;

  amount: number;
  categoryId: Types.ObjectId;
  financialAccountId: Types.ObjectId;
  expenseDate: Date;

  description?: string;
  reference?: string;

  attachment?: string;

  createdBy?: Types.ObjectId | null;
  updatedBy?: Types.ObjectId | null;
  deletedBy?: Types.ObjectId | null;
  deletedAt?: Date | null;
  isDeleted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}