import { z } from "zod";

import { KPI_EXTRA_KEY_REGEX, KPI_MAX_EXTRA_ITEMS, KPI_MONTH_REGEX } from "../kpi/kpi.constant";

import {
  KPI_REPORT_COMMENT_MAX,
  KPI_REPORT_STATUS,
  KPI_REPORT_TEXT_MAX,
} from "./kpi-report.constant";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId.");

const nonNegative = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number.` })
    .finite(`${label} must be a finite number.`)
    .min(0, `${label} cannot be negative.`);

const extraResultSchema = z.object({
  key: z.string().trim().regex(KPI_EXTRA_KEY_REGEX, "Invalid extra item key."),
  achieved: nonNegative("Achieved value"),
});

/**
 * Fields the owner can write. Achievement numbers (sales, projects) are NOT here:
 * the server computes them, and .strict() rejects any attempt to send them.
 */
export const reportContentSchema = z
  .object({
    actualBudgetSpent: nonNegative("Budget spent"),
    extraItemResults: z.array(extraResultSchema).max(KPI_MAX_EXTRA_ITEMS),
    summary: z.string().trim().max(KPI_REPORT_TEXT_MAX),
    challenges: z.string().trim().max(KPI_REPORT_TEXT_MAX),
  })
  .partial()
  .strict();

export const returnReportValidationSchema = z.object({
  comment: z
    .string({ required_error: "A comment is required when returning a report." })
    .trim()
    .min(1, "A comment is required when returning a report.")
    .max(KPI_REPORT_COMMENT_MAX),
});

export const reviewReportSchema = z.object({
  comment: z.string().trim().max(KPI_REPORT_COMMENT_MAX).optional(),
});

/* ----------------------------- query / params ---------------------------- */

export const monthParamSchema = z.object({
  month: z.string().regex(KPI_MONTH_REGEX, "Month must be in YYYY-MM format."),
});

export const monthQuerySchema = z.object({
  month: z.string().regex(KPI_MONTH_REGEX, "Month must be in YYYY-MM format.").optional(),
});

export const listReportQuerySchema = z.object({
  month: z.string().regex(KPI_MONTH_REGEX, "Month must be in YYYY-MM format.").optional(),
  status: z
    .enum([KPI_REPORT_STATUS.DRAFT, KPI_REPORT_STATUS.SUBMITTED, KPI_REPORT_STATUS.REVIEWED])
    .optional(),
  userId: objectId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type ReportContentInput = z.infer<typeof reportContentSchema>;
export type ListReportQuery = z.infer<typeof listReportQuerySchema>;
