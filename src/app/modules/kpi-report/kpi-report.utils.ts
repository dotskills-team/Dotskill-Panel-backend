import { DAY_MS } from "../attendance/attendance.constant";
import { getMonthRangeUtc } from "../kpi/kpi.month";

import { KPI_REPORT_DEADLINE_DAY } from "./kpi-report.constant";

/**
 * Time rules for KPI reports. Everything follows the Asia/Dhaka calendar.
 * Pure functions, no database, so they are easy to test.
 */

/** The instant submitting opens: 00:00 on the last day of the report's month (Dhaka). */
export const getSubmitOpensAt = (month: string): Date =>
  new Date(getMonthRangeUtc(month).end.getTime() - DAY_MS);

/**
 * The deadline: the very last moment of day KPI_REPORT_DEADLINE_DAY of the next month (Dhaka).
 * A submission is late when it happens after this instant.
 */
export const getReportDeadline = (month: string): Date =>
  new Date(getMonthRangeUtc(month).end.getTime() + KPI_REPORT_DEADLINE_DAY * DAY_MS - 1);

/** Submitting is allowed from the last day of the month onward. */
export const canSubmitReport = (month: string, now: Date = new Date()): boolean =>
  now.getTime() >= getSubmitOpensAt(month).getTime();

export const isLateSubmission = (month: string, submittedAt: Date): boolean =>
  submittedAt.getTime() > getReportDeadline(month).getTime();

/**
 * Checks report extra-item keys against the KPI's extra items.
 * - Every reported key must exist on the KPI, and none may repeat.
 * - With requireAll, every KPI extra item must also have a result (used on submit).
 * Returns an error message, or null when the keys are fine.
 */
export const checkExtraResultKeys = (
  kpiKeys: string[],
  resultKeys: string[],
  requireAll: boolean,
): string | null => {
  const allowed = new Set(kpiKeys);
  const seen = new Set<string>();

  for (const key of resultKeys) {
    if (!allowed.has(key)) return `"${key}" is not an extra item of this KPI.`;
    if (seen.has(key)) return `Duplicate result for "${key}".`;
    seen.add(key);
  }

  if (requireAll) {
    const missing = kpiKeys.filter((key) => !seen.has(key));
    if (missing.length > 0) return `Missing results for: ${missing.join(", ")}.`;
  }

  return null;
};
