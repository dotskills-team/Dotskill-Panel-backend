import { envVars } from "../../config/env";
import { Role } from "../user/user.interface";

/** Lifecycle status shared by domains and hosting. */
export enum RenewalStatus {
  ACTIVE = "active",
  EXPIRING_SOON = "expiring_soon",
  EXPIRED = "expired",
  RENEWED = "renewed",
  CANCELLED = "cancelled",
}

export enum PaidBy {
  COMPANY = "company",
  CLIENT = "client",
}

export enum HostingType {
  SHARED = "shared",
  VPS = "vps",
  CLOUD = "cloud",
  DEDICATED = "dedicated",
  OTHER = "other",
}

export enum BillingCycle {
  MONTHLY = "monthly",
  YEARLY = "yearly",
  BIENNIAL = "biennial",
}

export enum RenewalAction {
  CLIENT_CONTACTED = "client_contacted",
  RENEWED = "renewed",
  REMINDER_SENT = "reminder_sent",
  NOTE = "note",
}

export enum ContactMethod {
  PHONE = "phone",
  WHATSAPP = "whatsapp",
  EMAIL = "email",
  OTHER = "other",
}

/** Which collection a log, renewal or credential reveal belongs to. */
export enum TargetType {
  DOMAIN = "domain",
  HOSTING = "hosting",
}

export const DEFAULT_CURRENCY = "BDT";

/** Items expiring within this many days are marked `expiring_soon`. */
export const EXPIRING_SOON_DAYS = 30;

/** Reminder thresholds used when DOMAIN_REMINDER_DAYS is not set. */
const DEFAULT_REMINDER_DAYS = [30, 15, 7, 3, 1, 0];

/** Parses "30,15,7,3,1,0" into a sorted, de-duplicated list of whole numbers >= 0. */
const parseReminderDays = (raw?: string): number[] => {
  if (!raw) return DEFAULT_REMINDER_DAYS;

  const days = raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 0);

  if (days.length === 0) return DEFAULT_REMINDER_DAYS;

  return [...new Set(days)].sort((a, b) => b - a);
};

/** Days before expiry (0 = expiry day) on which a reminder notification is created. */
export const REMINDER_DAYS = parseReminderDays(envVars.DOMAIN_REMINDER_DAYS);

/** Roles that may see the module at all. Everyone else gets no access. */
export const READ_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.DEVELOPER];

/** Roles that may create, edit, renew, log contacts and delete. */
export const WRITE_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.DEVELOPER];

/** Roles that may see credential fields and reveal passwords. */
export const CREDENTIAL_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN];

/** Roles that receive in-app reminder notifications. */
export const NOTIFICATION_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN];
