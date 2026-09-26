import { z } from "zod";
import { CATEGORY_STATUS } from "./expense-category.constant";

export const createExpenseCategoryZodSchema = z.object({
  name: z.string({ required_error: "Category name is required" }).min(2).max(100),
  description: z.string().max(500).optional(),
  status: z.enum(Object.values(CATEGORY_STATUS) as [string, ...string[]]).optional(),
});

export const updateExpenseCategoryZodSchema = createExpenseCategoryZodSchema.partial();