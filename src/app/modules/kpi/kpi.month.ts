import { DHAKA_OFFSET_MS } from "../attendance/attendance.constant";

import { KPI_MONTH_REGEX } from "./kpi.constant";

/**
 * KPI months follow the Asia/Dhaka calendar.
 * Dhaka is UTC+6 all year (no daylight saving), so a fixed offset is exact.
 */

export const isValidKpiMonth = (month: string): boolean => KPI_MONTH_REGEX.test(month);

/** "YYYY-MM" of an instant, in Asia/Dhaka. */
export const toDhakaMonth = (instant: Date): string =>
  new Date(instant.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 7);

/** Current month in Asia/Dhaka. */
export const currentDhakaMonth = (now: Date = new Date()): string => toDhakaMonth(now);

/**
 * UTC range of a Dhaka month: start is inclusive, end (the start of the next month) is exclusive.
 * Use it as { $gte: start, $lt: end }.
 */
export const getMonthRangeUtc = (month: string): { start: Date; end: Date } => {
  if (!isValidKpiMonth(month)) {
    throw new RangeError(`Invalid month "${month}". Expected YYYY-MM.`);
  }

  const [year, monthNumber] = month.split("-").map(Number);

  // Date.UTC rolls month 12 over into January of the next year
  const start = new Date(Date.UTC(year, monthNumber - 1, 1) - DHAKA_OFFSET_MS);
  const end = new Date(Date.UTC(year, monthNumber, 1) - DHAKA_OFFSET_MS);

  return { start, end };
};
