import { Types } from "mongoose";

export enum Role {
  SUPER_ADMIN = "SUPER_ADMIN",
  ADMIN = "ADMIN",
  MANAGER = "MANAGER",
  DEVELOPER = "DEVELOPER",
  DESIGNER = "DESIGNER",
  MARKETER = "MARKETER",
  STAFF = "STAFF",
}

export enum UserStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  SUSPENDED = "SUSPENDED",
}

export enum Gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
  OTHER = "OTHER",
  PREFER_NOT_TO_SAY = "PREFER_NOT_TO_SAY",
}

export enum PaymentMethod {
  CASH = "CASH",
  BKASH = "BKASH",
  NAGAD = "NAGAD",
  BANK = "BANK",
}

export interface IBankAccount {
  accountHolderName: string;
  accountNumber: string;
  bankName: string;
  branchName?: string;
  routingNumber?: string;
}

export interface IPaymentAccount {
  accountHolderName: string;
  accountNumber: string;
}

export interface IUser {
  _id?: Types.ObjectId;

  firstName?: string;
  lastName?: string;
  fullName?: string;

  email: string;
  password?: string;
  gender?: Gender;

  dateOfBirth?: Date;

  salary?: number;

  paymentMethod?: PaymentMethod;

  paymentAccount?: IPaymentAccount;

  bankAccount?: IBankAccount;
  phone?: string;

  avatar?: string;

  address?: string;

  bio?: string;
  role: Role;

  designation?: string;

  department?: string;

  joiningDate?: Date;

  reportingManager?: Types.ObjectId;

  isVerified: boolean;

  status: UserStatus;

  permissions: string[];

  createdBy?: Types.ObjectId;

  updatedBy?: Types.ObjectId;

  deletedBy?: Types.ObjectId;

  deletedAt?: Date;

  isDeleted: boolean;

  lastLogin?: Date;

  passwordChangedAt?: Date;

  createdAt?: Date;

  updatedAt?: Date;
}
