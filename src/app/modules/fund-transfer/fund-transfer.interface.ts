import { Types } from "mongoose";

export interface IFundTransfer {
  _id?: Types.ObjectId;

  fromAccountId: Types.ObjectId;
  toAccountId: Types.ObjectId;
  amount: number;
  transferDate: Date;

  reference?: string;
  note?: string;

  createdBy?: Types.ObjectId | null;
  deletedBy?: Types.ObjectId | null;
  deletedAt?: Date | null;
  isDeleted: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}