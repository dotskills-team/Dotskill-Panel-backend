import { Role } from "../user/user.interface";

/** Business timezone: attendance days are grouped by the calendar date in this zone. */
export const ATTENDANCE_TIMEZONE = "Asia/Dhaka";

/** Asia/Dhaka is UTC+6 all year (no daylight saving). */
export const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Roles that can view everyone's attendance and edit records. */
export const ATTENDANCE_MANAGER_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER];

export enum AttendanceState {
  NOT_STARTED = "not-started",
  WORKING = "working",
  ON_BREAK = "on-break",
  CHECKED_OUT = "checked-out",
}

/** Manual edits may not move a time further than this into the future (clock-skew allowance). */
export const FUTURE_TOLERANCE_MS = 60 * 1000;

/** A single attendance record cannot span more than this. */
export const MAX_SHIFT_MS = DAY_MS;
