export const KPI_TYPE = {
  INDIVIDUAL: "individual",
  TEAM: "team",
} as const;

export const KPI_STATUS = {
  DRAFT: "draft",
  ACTIVE: "active",
  CLOSED: "closed",
} as const;

export const KPI_UNIT = {
  AMOUNT: "amount",
  COUNT: "count",
} as const;

/** Month format used everywhere in the KPI module: YYYY-MM. */
export const KPI_MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Extra item key: short, URL-safe identifier. */
export const KPI_EXTRA_KEY_REGEX = /^[a-zA-Z0-9_-]{1,40}$/;

export const KPI_MAX_EXTRA_ITEMS = 20;
export const KPI_MAX_BUDGET_ITEMS = 30;

/** Allowed status moves. Closed is final. */
export const KPI_STATUS_FLOW: Record<string, string | null> = {
  [KPI_STATUS.DRAFT]: KPI_STATUS.ACTIVE,
  [KPI_STATUS.ACTIVE]: KPI_STATUS.CLOSED,
  [KPI_STATUS.CLOSED]: null,
};

/** Statuses that non-admin readers (members, and the lead for the team KPI) may see. */
export const KPI_READER_VISIBLE_STATUSES: Array<"active" | "closed"> = [
  KPI_STATUS.ACTIVE,
  KPI_STATUS.CLOSED,
];
