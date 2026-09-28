import { z } from "zod";
import { ACCOUNT_TYPE, ACCOUNT_STATUS, PROVIDER_NAME } from "./financial-account.constant";

export const createFinancialAccountZodSchema = z.object({
  accountName: z.string({ required_error: "Account name is required" }).min(2).max(100),
  accountType: z.enum(Object.values(ACCOUNT_TYPE) as [string, ...string[]]),
  // providerName: z.enum(Object.values(PROVIDER_NAME) as [string, ...string[]]).optional(),
  providerName: z
  .enum(Object.values(PROVIDER_NAME) as [string, ...string[]])
  .nullable()
  .optional(),
  accountNumber: z.string().optional(),
  accountHolderName: z.string().optional(),
  ownerId: z.string().nullable().optional(),
  bankName: z.string().optional(),
  branchName: z.string().optional(),
  openingBalance: z.number().min(0).default(0),
  currency: z.string().default("BDT"),
  description: z.string().max(500).optional(),
  status: z.enum(Object.values(ACCOUNT_STATUS) as [string, ...string[]]).optional(),
});

export const updateFinancialAccountZodSchema = createFinancialAccountZodSchema.partial();