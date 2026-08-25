import { PaymentMethod } from "../user/user.interface";

export enum SalaryPaymentStatus {
  PENDING = "PENDING",
  PARTIAL = "PARTIAL",
  PAID = "PAID",
  OVERDUE = "OVERDUE",
  CANCELLED = "CANCELLED",
}

export const SALARY_PAYMENT_STATUSES = Object.values(SalaryPaymentStatus);

export const SALARY_SEARCHABLE_FIELDS = [
  "paymentReference",
  "note",
];

export const SALARY_FILTERABLE_FIELDS = [
  "user",
  "month",
  "year",
  "status",
  "paymentMethod",
];

export const SALARY_DEFAULT_SORT = "-year,-month,-createdAt";

export const MAX_SALARY_PAYMENTS = 50;

export const SALARY_MONTHS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Date(2000, index).toLocaleString("en-US", {
    month: "long",
  }),
}));

export const SALARY_PAYMENT_METHODS = Object.values(PaymentMethod);