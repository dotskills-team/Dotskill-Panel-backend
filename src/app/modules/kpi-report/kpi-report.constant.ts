export const KPI_REPORT_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  REVIEWED: "reviewed",
} as const;

/**
 * Reports are due by the end of this day of the NEXT month (Asia/Dhaka).
 * Example: the November report is due by the end of 5 December.
 */
export const KPI_REPORT_DEADLINE_DAY = 5;

export const KPI_REPORT_TEXT_MAX = 5000;
export const KPI_REPORT_COMMENT_MAX = 1000;
