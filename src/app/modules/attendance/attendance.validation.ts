import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID");
const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const monthString = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be YYYY-MM");

// ISO date-time strings from the client are coerced to Date objects.
const dateTime = z.coerce.date();

const breakInput = z.object({
  start: dateTime,
  end: dateTime.nullable().optional(),
});

/* ------------------------------ body schemas ------------------------------ */

export const updateAttendanceZodSchema = z.object({
  checkIn: dateTime.optional(),
  checkOut: dateTime.nullable().optional(),
  breaks: z.array(breakInput).max(20).optional(),
  editReason: z.string().trim().min(3, "A reason is required").max(500),
});

export const createAttendanceZodSchema = z.object({
  userId: objectId,
  date: dayString,
  checkIn: dateTime,
  checkOut: dateTime.nullable().optional(),
  breaks: z.array(breakInput).max(20).default([]),
  editReason: z.string().trim().min(3, "A reason is required").max(500),
});

/* ------------------------------ query schemas ----------------------------- */

export const monthQuerySchema = z.object({
  month: monthString.optional(),
});

export const summaryQuerySchema = z.object({
  month: monthString.optional(),
});

export const listAttendanceQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  from: dayString.optional(),
  to: dayString.optional(),
  userId: objectId.optional(),
});
