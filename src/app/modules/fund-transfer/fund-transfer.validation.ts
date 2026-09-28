import { z } from "zod";

export const createFundTransferZodSchema = z.object({
  fromAccountId: z.string({ required_error: "From account is required" }).min(1),
  toAccountId: z.string({ required_error: "To account is required" }).min(1),
  amount: z.coerce.number({ required_error: "Amount is required" }).positive(),
  transferDate: z.coerce.date({ required_error: "Transfer date is required" }),
  reference: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
});