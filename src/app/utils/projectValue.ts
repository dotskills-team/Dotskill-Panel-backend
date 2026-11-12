import { Role } from "../modules/user/user.interface";

/**
 * Central place for hiding project money from roles that must not see it.
 *
 * Rule: only SUPER_ADMIN and ADMIN may receive the project value (budget) and
 * anything that reveals it (received, outstanding, overpaid, payment lines,
 * installment schedule). Every other role gets these fields stripped.
 *
 * Use these helpers on every code path that returns a project, or data derived
 * from projects, instead of writing ad-hoc field lists.
 */

/** Project fields that carry or reveal the project value. */
export const PROJECT_VALUE_FIELDS = [
  "budget",
  "payments",
  "paymentSchedule",
  "paymentStatus",
  "nextPaymentDate",
  "balanceReversed",
  "receivedAmount",
  "outstandingAmount",
  "overpaidAmount",
  "hasAdvance",
] as const;

/** Client totals that are rolled up from project money. */
export const CLIENT_VALUE_FIELDS = [
  "totalRevenue",
  "totalInvoices",
  "totalPaid",
  "totalDue",
] as const;

const VALUE_VIEW_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN];

/** True when the role may receive project value data. */
export const canViewProjectValue = (role?: string | null): boolean =>
  !!role && VALUE_VIEW_ROLES.includes(role);

/** Mongoose select string that excludes every project value field. */
export const PROJECT_VALUE_HIDDEN_SELECT = PROJECT_VALUE_FIELDS.map((f) => `-${f}`).join(" ");

/** Select string for a role: empty for admins, exclusion list for everyone else. */
export const projectValueSelectFor = (role?: string | null): string =>
  canViewProjectValue(role) ? "" : PROJECT_VALUE_HIDDEN_SELECT;

type AnyRecord = Record<string, unknown>;

/** Turns a Mongoose document into the same plain shape that res.json would send. */
const toPlain = (value: unknown): AnyRecord | null => {
  if (!value || typeof value !== "object") return null;
  const maybeDoc = value as { toJSON?: () => AnyRecord };
  return typeof maybeDoc.toJSON === "function" ? maybeDoc.toJSON() : { ...(value as AnyRecord) };
};

const omitKeys = (value: unknown, keys: readonly string[]): unknown => {
  const plain = toPlain(value);
  if (!plain) return value;
  for (const key of keys) delete plain[key];
  return plain;
};

/** Removes project value fields for non-admin roles. Admins get the input back untouched. */
export const sanitizeProjectForRole = <T>(project: T, role?: string | null): T => {
  if (canViewProjectValue(role) || project == null) return project;
  return omitKeys(project, PROJECT_VALUE_FIELDS) as T;
};

export const sanitizeProjectsForRole = <T>(projects: T[] | null | undefined, role?: string | null): T[] => {
  const list = projects ?? [];
  if (canViewProjectValue(role)) return list;
  return list.map((p) => sanitizeProjectForRole(p, role));
};

/**
 * Removes money rollups from a client and from the projects embedded in it.
 * Admins get the input back untouched.
 */
export const sanitizeClientForRole = <T>(client: T, role?: string | null): T => {
  if (canViewProjectValue(role) || client == null) return client;
  const plain = omitKeys(client, CLIENT_VALUE_FIELDS) as AnyRecord;
  if (Array.isArray(plain.projects)) {
    plain.projects = sanitizeProjectsForRole(plain.projects as unknown[], role);
  }
  return plain as T;
};

export const sanitizeClientsForRole = <T>(clients: T[] | null | undefined, role?: string | null): T[] => {
  const list = clients ?? [];
  if (canViewProjectValue(role)) return list;
  return list.map((c) => sanitizeClientForRole(c, role));
};

/** Drops money totals from a client stats object for non-admin roles. */
export const sanitizeClientStatsForRole = <T extends object>(stats: T, role?: string | null): T => {
  if (canViewProjectValue(role)) return stats;
  const copy: AnyRecord = { ...(stats as AnyRecord) };
  for (const key of CLIENT_VALUE_FIELDS) delete copy[key];
  return copy as T;
};

const fieldHit = (key: string, fields: readonly string[]): boolean =>
  fields.some((f) => key === f || key.startsWith(`${f}[`) || key.startsWith(`${f}.`));

/**
 * Removes query keys that could filter, sort or project by money fields so a
 * non-admin cannot probe values through the URL. Mutates and returns the query.
 */
export const stripValueQueryForRole = <T extends Record<string, any>>(
  query: T,
  role: string | null | undefined,
  fields: readonly string[] = PROJECT_VALUE_FIELDS,
): T => {
  if (canViewProjectValue(role)) return query;

  for (const key of Object.keys(query)) {
    if (fieldHit(key, fields)) delete query[key];
  }

  // A custom field projection could re-include hidden fields
  delete query.fields;

  if (typeof query.sort === "string") {
    const kept = query.sort
      .split(",")
      .filter((token: string) => token && !fieldHit(token.replace(/^-/, ""), fields));
    if (kept.length) {
      (query as Record<string, any>).sort = kept.join(",");
    } else {
      delete query.sort;
    }
  }

  return query;
};
