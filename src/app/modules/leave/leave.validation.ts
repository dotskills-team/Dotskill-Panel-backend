import { z } from "zod";
import { ExtraLeaveType, HalfDaySession, LeaveStatus, LeaveType, YearEndRule } from "./leave.constant";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID");
const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm");

const attachment = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(200),
});

/**
 * Field-level rules only. Rules that depend on the leave type (half-day session,
 * leave time, ...) and on the policy are enforced in the service, because the
 * validateRequest middleware needs a plain ZodObject.
 */
const requestFields = {
  leaveType: z.nativeEnum(LeaveType),
  startDate: dayString,
  endDate: dayString.optional(),
  halfDaySession: z.nativeEnum(HalfDaySession).optional(),
  leaveTime: timeString.optional(),
  expectedArrivalTime: timeString.optional(),
  reason: z.string().trim().min(3, "Please give a short reason").max(1000),
  emergencyContact: z.string().trim().max(100).optional(),
  attachments: z.array(attachment).max(5).optional(),
};

export const createLeaveRequestZodSchema = z.object(requestFields);

export const createForStaffZodSchema = z.object({
  ...requestFields,
  staffId: objectId,
  /** Approve immediately after creating (default true). */
  autoApprove: z.boolean().default(true),
  /** Required when the request is over balance and autoApprove is true. */
  extraLeaveType: z.nativeEnum(ExtraLeaveType).optional(),
  extraApprovalNote: z.string().trim().min(3).max(500).optional(),
});

export const approveLeaveZodSchema = z.object({
  note: z.string().trim().max(500).optional(),
  extraLeaveType: z.nativeEnum(ExtraLeaveType).optional(),
  extraApprovalNote: z.string().trim().min(3, "A comment is required").max(500).optional(),
});

export const rejectLeaveZodSchema = z.object({
  reason: z.string().trim().min(3, "A rejection reason is required").max(500),
  note: z.string().trim().max(500).optional(),
});

export const recommendLeaveZodSchema = z.object({
  note: z.string().trim().min(3, "Please write a comment").max(500),
});

export const updateLeaveRequestZodSchema = z.object({
  leaveType: z.nativeEnum(LeaveType).optional(),
  startDate: dayString.optional(),
  endDate: dayString.optional(),
  halfDaySession: z.nativeEnum(HalfDaySession).optional(),
  leaveTime: timeString.optional(),
  expectedArrivalTime: timeString.optional(),
  reason: z.string().trim().min(3).max(1000).optional(),
  emergencyContact: z.string().trim().max(100).optional(),
  attachments: z.array(attachment).max(5).optional(),
  /** Needed from an admin when an edit makes an approved request over balance. */
  extraLeaveType: z.nativeEnum(ExtraLeaveType).optional(),
  extraApprovalNote: z.string().trim().min(3).max(500).optional(),
  note: z.string().trim().max(500).optional(),
});

export const adjustBalanceZodSchema = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  field: z.enum(["totalQuota", "carriedForward"]).default("totalQuota"),
  amount: z
    .number()
    .refine((n) => n !== 0, "Amount cannot be zero")
    .refine((n) => Math.abs(n * 2) % 1 === 0, "Use whole or half days"),
  reason: z.string().trim().min(3, "A reason is required").max(500),
});

export const updatePolicyZodSchema = z.object({
  annualLeaveQuota: z.number().min(0).max(365).optional(),
  staffQuotaOverrides: z
    .array(z.object({ staff: objectId, quota: z.number().min(0).max(365) }))
    .optional(),
  weeklyOffDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  publicHolidays: z
    .array(z.object({ date: dayString, name: z.string().trim().min(1).max(100) }))
    .optional(),
  minAdvanceNoticeDays: z.number().int().min(0).max(60).optional(),
  allowPastDateRequestsAdminOnly: z.boolean().optional(),
  yearEndRule: z.nativeEnum(YearEndRule).optional(),
  carryForwardMax: z.number().min(0).max(365).optional(),
  defaultExtraLeaveType: z.nativeEnum(ExtraLeaveType).optional(),
  maxExtraDaysWarning: z.number().min(0).max(365).optional(),
  pendingReminderAfterDays: z.number().int().min(1).max(60).optional(),
});

/* ------------------------------ query schemas ------------------------------ */

export const listLeaveRequestsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.nativeEnum(LeaveStatus).optional(),
  leaveType: z.nativeEnum(LeaveType).optional(),
  staff: objectId.optional(),
  from: dayString.optional(),
  to: dayString.optional(),
  extraOnly: z.enum(["true", "false"]).optional(),
  /** "true" = only my own requests, "false" = everyone's except mine (approvals queue). */
  mine: z.enum(["true", "false"]).optional(),
  sort: z.enum(["createdAt", "-createdAt", "startDate", "-startDate"]).optional(),
});

export const balanceQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  action: z.string().optional(),
  staff: objectId.optional(),
});

export const calendarQuerySchema = z.object({
  from: dayString,
  to: dayString,
});

export const conflictsQuerySchema = z.object({
  from: dayString,
  to: dayString,
  department: z.string().trim().max(100).optional(),
  excludeRequestId: objectId.optional(),
});

export const runJobsZodSchema = z.object({
  job: z.enum(["reminders", "stale", "rollover", "all"]).default("all"),
  /** Only used by the rollover job. */
  year: z.number().int().min(2000).max(2100).optional(),
});

export const reportQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  /** Omit for a whole-year report. */
  month: z.coerce.number().int().min(1).max(12).optional(),
  /** Limit the report to one staff member. */
  staff: objectId.optional(),
});

export const reportExportQuerySchema = reportQuerySchema.extend({
  format: z.enum(["xlsx", "pdf"]),
});
