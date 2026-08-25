import { Types } from "mongoose";
import { PaymentMethod } from "../user/user.interface";
import { SalaryPaymentStatus } from "./team-salary.constant";

export interface ISalaryPayment {
  _id?: Types.ObjectId;

  amount: number;

  paymentMethod: PaymentMethod;

  paymentDate: Date;

  paymentReference?: string;

  note?: string;

  recordedBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITeamSalary {
  _id?: Types.ObjectId;

  user: Types.ObjectId;
  month: number;

  year: number;
  cancelledAt?: Date;

cancelledBy?: Types.ObjectId;

cancellationReason?: string;
  salaryAmount: number;

  paidAmount: number;
  dueAmount: number;

  status: SalaryPaymentStatus;

  payments: ISalaryPayment[];

  note?: string;

  createdBy?: Types.ObjectId;

  updatedBy?: Types.ObjectId;

  createdAt?: Date;

  updatedAt?: Date;
}