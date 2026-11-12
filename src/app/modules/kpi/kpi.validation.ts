import { z } from "zod";

import {
  KPI_EXTRA_KEY_REGEX,
  KPI_MAX_BUDGET_ITEMS,
  KPI_MAX_EXTRA_ITEMS,
  KPI_MONTH_REGEX,
  KPI_STATUS,
  KPI_TYPE,
  KPI_UNIT,
} from "./kpi.constant";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId.");

const monthSchema = z
  .string({ required_error: "Month is required." })
  .regex(KPI_MONTH_REGEX, "Month must be in YYYY-MM format.");

const nonNegative = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number.` })
    .finite(`${label} must be a finite number.`)
    .min(0, `${label} cannot be negative.`);

const extraItemSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(KPI_EXTRA_KEY_REGEX, "Key may only contain letters, numbers, - and _ (max 40)."),
  name: z.string().trim().min(1, "Name is required.").max(100),
  unit: z.enum([KPI_UNIT.AMOUNT, KPI_UNIT.COUNT]),
  target: nonNegative("Extra item target"),
});

// Keys must be unique inside one KPI (case-insensitive)
const extraItemsSchema = z
  .array(extraItemSchema)
  .max(KPI_MAX_EXTRA_ITEMS, `A KPI can have at most ${KPI_MAX_EXTRA_ITEMS} extra items.`)
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      const key = item.key.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate extra item key "${item.key}".`,
          path: [index, "key"],
        });
      }
      seen.add(key);
    });
  });

// The budget is never sent as a number: it is the sum of these items
const budgetItemsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1, "Budget item name is required.").max(100),
      amount: nonNegative("Budget item amount"),
    }),
  )
  .max(KPI_MAX_BUDGET_ITEMS, `A KPI can have at most ${KPI_MAX_BUDGET_ITEMS} budget items.`);

const targetsShape = {
  targetSales: nonNegative("Target sales"),
  targetProjects: nonNegative("Target projects").int("Target projects must be a whole number."),
  budgetItems: budgetItemsSchema.default([]),
  extraItems: extraItemsSchema.default([]),
};

export const createKpiValidationSchema = z.object({
  type: z.enum([KPI_TYPE.INDIVIDUAL, KPI_TYPE.TEAM]),
  month: monthSchema,
  // Required for individual KPIs, not allowed for the team KPI (checked in the service)
  user: objectId.optional(),
  ...targetsShape,
  // A new KPI can start as draft or go live right away; closed is reached via the status flow
  status: z.enum([KPI_STATUS.DRAFT, KPI_STATUS.ACTIVE]).optional(),
  note: z.string().trim().max(2000).optional(),
});

// type, user and month never change after creation, so unknown keys are rejected
export const updateKpiValidationSchema = z
  .object({
    targetSales: nonNegative("Target sales"),
    targetProjects: nonNegative("Target projects").int("Target projects must be a whole number."),
    budgetItems: budgetItemsSchema,
    extraItems: extraItemsSchema,
    note: z.string().trim().max(2000),
  })
  .partial()
  .strict();

export const updateKpiStatusValidationSchema = z.object({
  status: z.enum([KPI_STATUS.ACTIVE, KPI_STATUS.CLOSED]),
});

/* ----------------------------- query schemas ----------------------------- */

export const listKpiQuerySchema = z.object({
  month: monthSchema.optional(),
  userId: objectId.optional(),
  type: z.enum([KPI_TYPE.INDIVIDUAL, KPI_TYPE.TEAM]).optional(),
  status: z.enum([KPI_STATUS.DRAFT, KPI_STATUS.ACTIVE, KPI_STATUS.CLOSED]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

// Month is optional; the service falls back to the current month
export const monthQuerySchema = z.object({
  month: monthSchema.optional(),
});

// Admin breakdown: optionally narrowed to one user
export const progressProjectsQuerySchema = z.object({
  month: monthSchema.optional(),
  userId: objectId.optional(),
});

export type CreateKpiInput = z.infer<typeof createKpiValidationSchema>;
export type UpdateKpiInput = z.infer<typeof updateKpiValidationSchema>;
export type ListKpiQuery = z.infer<typeof listKpiQuerySchema>;
