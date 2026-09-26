import { z } from "zod";

export const createExpenseZodSchema = z.object({
  amount: z.number({ required_error: "Amount is required" }).positive(),
  categoryId: z.string({ required_error: "Category is required" }),
  financialAccountId: z.string({ required_error: "Financial account is required" }),
  expenseDate: z.coerce.date({ required_error: "Expense date is required" }),
  description: z.string().max(500).optional(),
  reference: z.string().max(100).optional(),
  attachment: z.string().optional(),
});

export const updateExpenseZodSchema = createExpenseZodSchema.partial();