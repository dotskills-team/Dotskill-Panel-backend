import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID");

export const createLoanZodSchema = z.object({
  lenderName: z.string().min(2, "Lender name is required").max(100),
  lenderPhone: z.string().max(30).optional(),
  amount: z.number().positive("Amount must be greater than 0"),
  accountId: objectId,
  receivedDate: z.string().min(1, "Date is required"),
  dueDate: z.string().nullable().optional(),
  note: z.string().max(500).optional(),
});

export const repayLoanZodSchema = z.object({
  accountId: objectId,
  amount: z.number().positive("Amount must be greater than 0"),
  date: z.string().min(1, "Date is required"),
  note: z.string().max(500).optional(),
});

export const updateLoanZodSchema = z.object({
  lenderName: z.string().min(1).optional(),
  lenderPhone: z.string().optional(),
  amount: z.number().positive().optional(),
  accountId: z.string().optional(),
  receivedDate: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  note: z.string().optional(),
});