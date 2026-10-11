import { z } from "zod";

export const depositZodSchema = z.object({
  accountId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid account ID"),
  amount: z.number().positive("Amount must be greater than 0"),
  date: z.string().min(1, "Date is required"),
  note: z.string().max(500).optional(),
});