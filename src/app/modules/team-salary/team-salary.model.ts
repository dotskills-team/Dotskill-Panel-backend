import { Schema, model } from "mongoose";

import { PaymentMethod } from "../user/user.interface";

import { SalaryPaymentStatus } from "./team-salary.constant";

import type { ISalaryPayment, ITeamSalary } from "./team-salary.interface";

const salaryPaymentSchema = new Schema<ISalaryPayment>(
  {
    amount: {
      type: Number,
      required: true,
      min: [0, "Payment amount cannot be negative."],
    },

    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
      required: true,
    },

    paymentDate: {
      type: Date,
      required: true,
    },

    paymentReference: {
      type: String,
      trim: true,
      maxlength: [150, "Payment reference cannot exceed 150 characters."],
    },

    note: {
      type: String,
      trim: true,
      maxlength: [1000, "Payment note cannot exceed 1000 characters."],
    },

    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    _id: true,
    timestamps: true,
  },
);

const teamSalarySchema = new Schema<ITeamSalary>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    month: {
      type: Number,
      required: true,
      min: [1, "Month must be between 1 and 12."],
      max: [12, "Month must be between 1 and 12."],
      index: true,
    },

    year: {
      type: Number,
      required: true,
      min: [2000, "Invalid payroll year."],
      max: [3000, "Invalid payroll year."],
      index: true,
    },

    salaryAmount: {
      type: Number,
      required: true,
      min: [0, "Salary amount cannot be negative."],
    },

    paidAmount: {
      type: Number,
      required: true,
      default: 0,
      min: [0, "Paid amount cannot be negative."],
    },

    dueAmount: {
      type: Number,
      required: true,
      min: [0, "Due amount cannot be negative."],
    },

    status: {
      type: String,
      enum: Object.values(SalaryPaymentStatus),
      required: true,
      default: SalaryPaymentStatus.PENDING,
      index: true,
    },

    payments: {
      type: [salaryPaymentSchema],
      default: [],
    },

    note: {
      type: String,
      trim: true,
      maxlength: [1000, "Salary note cannot exceed 1000 characters."],
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

teamSalarySchema.index(
  {
    user: 1,
    year: 1,
    month: 1,
  },
  {
    unique: true,
    name: "unique_user_monthly_salary",
  },
);

teamSalarySchema.index({
  year: -1,
  month: -1,
});

teamSalarySchema.index({
  status: 1,
  year: -1,
  month: -1,
});

teamSalarySchema.index({
  user: 1,
  year: -1,
  month: -1,
});

export const TeamSalary = model<ITeamSalary>("TeamSalary", teamSalarySchema);
