import { Types } from "mongoose";

export interface ILoan {
  _id?: Types.ObjectId;
  lenderName: string;
  lenderPhone?: string;
  principalAmount: number;
  repaidAmount: number;
  dueAmount: number;
  receivedAccountId: Types.ObjectId;
  receivedDate: Date;
  dueDate?: Date | null;
  status: "ACTIVE" | "PAID";
  note?: string;
  createdBy?: Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}