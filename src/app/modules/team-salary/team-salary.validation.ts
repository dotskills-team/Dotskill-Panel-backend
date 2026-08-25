import { z } from "zod";

import { PaymentMethod } from "../user/user.interface";
import { SalaryPaymentStatus } from "./team-salary.constant";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid user ID.");

const positiveAmountSchema = z
  .number({
    message: "Amount must be a number.",
  })
  .finite("Amount must be a valid number.")
  .positive("Amount must be greater than 0.");

const nonNegativeAmountSchema = z
  .number({
    message: "Amount must be a number.",
  })
  .finite("Amount must be a valid number.")
  .min(0, "Amount cannot be negative.");

export const createTeamSalarySchema = z.object({
  user: objectIdSchema,

  month: z
    .number({
      message: "Month is required.",
    })
    .int("Month must be an integer.")
    .min(1, "Month must be between 1 and 12.")
    .max(12, "Month must be between 1 and 12."),

  year: z
    .number({
      message: "Year is required.",
    })
    .int("Year must be an integer.")
    .min(2000, "Invalid payroll year.")
    .max(3000, "Invalid payroll year."),

  salaryAmount: nonNegativeAmountSchema.optional(),

  note: z
    .string()
    .trim()
    .max(1000, "Note cannot exceed 1000 characters.")
    .optional(),
});

export const generateMonthlySalarySchema = z.object({
  month: z
    .number({
      message: "Month is required.",
    })
    .int("Month must be an integer.")
    .min(1, "Month must be between 1 and 12."),

  year: z
    .number({
      message: "Year is required.",
    })
    .int("Year must be an integer.")
    .min(2000, "Invalid payroll year.")
    .max(3000, "Invalid payroll year."),
});

export const createSalaryPaymentSchema = z.object({
  amount: positiveAmountSchema,

  paymentMethod: z.enum(
    Object.values(PaymentMethod) as [
      PaymentMethod,
      ...PaymentMethod[],
    ],
    {
      message: "Invalid payment method.",
    },
  ),

  paymentDate: z
    .string({
      message: "Payment date is required.",
    }),

  paymentReference: z
    .string()
    .trim()
    .max(150, "Payment reference cannot exceed 150 characters.")
    .optional(),

  note: z
    .string()
    .trim()
    .max(1000, "Payment note cannot exceed 1000 characters.")
    .optional(),
});

export const updateTeamSalarySchema = z.object({
  note: z
    .string()
    .trim()
    .max(1000, "Note cannot exceed 1000 characters.")
    .optional(),
});

export const cancelTeamSalarySchema = z.object({
  reason: z
    .string({
      message: "Cancellation reason is required.",
    })
    .trim()
    .min(3, "Cancellation reason must be at least 3 characters.")
    .max(500, "Cancellation reason cannot exceed 500 characters."),
});

export const teamSalaryQuerySchema = z.object({
  user: objectIdSchema.optional(),

  month: z.coerce
    .number()
    .int()
    .min(1)
    .max(12)
    .optional(),

  year: z.coerce
    .number()
    .int()
    .min(2000)
    .max(3000)
    .optional(),

  status: z
    .enum(
      Object.values(SalaryPaymentStatus) as [
        SalaryPaymentStatus,
        ...SalaryPaymentStatus[],
      ],
    )
    .optional(),

  paymentMethod: z
    .enum(
      Object.values(PaymentMethod) as [
        PaymentMethod,
        ...PaymentMethod[],
      ],
    )
    .optional(),

  searchTerm: z.string().trim().optional(),

  page: z.coerce.number().int().min(1).optional(),

  limit: z.coerce.number().int().min(1).max(100).optional(),

  sort: z.string().trim().optional(),
});


export type CreateTeamSalaryInput = z.infer<
  typeof createTeamSalarySchema
>;

export type GenerateMonthlySalaryInput = z.infer<
  typeof generateMonthlySalarySchema
>;

export type CreateSalaryPaymentInput = z.infer<
  typeof createSalaryPaymentSchema
>;

export type UpdateTeamSalaryInput = z.infer<
  typeof updateTeamSalarySchema
>;

export type CancelTeamSalaryInput = z.infer<
  typeof cancelTeamSalarySchema
>;

export type TeamSalaryQueryInput = z.infer<
  typeof teamSalaryQuerySchema
>;