import { Role } from "../user/user.interface";

/**
 * Request types. `wfh` can be appended later: add it here, then decide in
 * LEAVE_TYPE_RULES whether it deducts balance (it should not) and what fields it needs.
 */
export enum LeaveType {
  CASUAL = "casual",
  SICK = "sick",
  ANNUAL = "annual",
  EMERGENCY = "emergency",
  UNPAID = "unpaid",
  EARLY_LEAVE = "early_leave",
  LATE_ARRIVAL = "late_arrival",
  HALF_DAY = "half_day",
}

export enum LeaveStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  CANCELLED = "cancelled",
}

export enum HalfDaySession {
  MORNING = "morning",
  AFTERNOON = "afternoon",
}

export enum ExtraLeaveType {
  UNPAID = "unpaid",
  ADVANCE = "advance",
  WAIVED = "waived",
}

export enum YearEndRule {
  RESET = "reset",
  CARRY_FORWARD = "carry_forward",
}

export enum LeaveAuditAction {
  REQUEST_EDITED = "request_edited",
  BALANCE_ADJUSTED = "balance_adjusted",
  EXTRA_LEAVE_DECISION = "extra_leave_decision",
  CREATED_ON_BEHALF = "created_on_behalf",
  AUTO_APPROVED = "auto_approved",
  POLICY_UPDATED = "policy_updated",
}

export enum TimelineAction {
  SUBMITTED = "submitted",
  APPROVED = "approved",
  REJECTED = "rejected",
  CANCELLED = "cancelled",
  EDITED = "edited",
  RECOMMENDED = "recommended",
  AUTO_APPROVED = "auto_approved",
  CREATED_ON_BEHALF = "created_on_behalf",
}

/**
 * Per-type behaviour. The balance never has per-type quotas: the type only decides
 * whether days are deducted and which extra fields the form needs.
 */
export const LEAVE_TYPE_RULES: Record<
  LeaveType,
  {
    /** Counts against the single yearly balance. */
    deductsBalance: boolean;
    /** Counted as days (false = a record-only entry, totalDays = 0). */
    countsDays: boolean;
    /** Single-day entries (startDate === endDate). */
    singleDay: boolean;
    /** Skips the minimum advance-notice rule (cannot be planned ahead). */
    noticeExempt: boolean;
  }
> = {
  [LeaveType.CASUAL]: { deductsBalance: true, countsDays: true, singleDay: false, noticeExempt: false },
  [LeaveType.SICK]: { deductsBalance: true, countsDays: true, singleDay: false, noticeExempt: true },
  [LeaveType.ANNUAL]: { deductsBalance: true, countsDays: true, singleDay: false, noticeExempt: false },
  [LeaveType.EMERGENCY]: { deductsBalance: true, countsDays: true, singleDay: false, noticeExempt: true },
  [LeaveType.UNPAID]: { deductsBalance: false, countsDays: true, singleDay: false, noticeExempt: false },
  [LeaveType.EARLY_LEAVE]: { deductsBalance: false, countsDays: false, singleDay: true, noticeExempt: true },
  [LeaveType.LATE_ARRIVAL]: { deductsBalance: false, countsDays: false, singleDay: true, noticeExempt: true },
  [LeaveType.HALF_DAY]: { deductsBalance: true, countsDays: true, singleDay: true, noticeExempt: false },
};

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  casual: "casual leave",
  sick: "sick leave",
  annual: "annual leave",
  emergency: "emergency leave",
  unpaid: "unpaid leave",
  early_leave: "early leave",
  late_arrival: "late arrival",
  half_day: "half day",
};

/** Types that occupy calendar days (used by the overlap check). */
export const DAY_CONSUMING_TYPES = Object.values(LeaveType).filter(
  (t) => LEAVE_TYPE_RULES[t].countsDays,
);

/** Roles that can decide requests at all. Managers are further limited (see leave.permissions). */
export const ADMIN_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN];
export const APPROVER_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER];

export const LEAVE_TIMEZONE = "Asia/Dhaka";

export const DEFAULT_POLICY = {
  annualLeaveQuota: 20,
  staffQuotaOverrides: [] as { staff: string; quota: number }[],
  weeklyOffDays: [5], // 0 = Sunday ... 6 = Saturday; Friday by default
  publicHolidays: [] as { date: string; name: string }[],
  minAdvanceNoticeDays: 1,
  allowPastDateRequestsAdminOnly: true,
  yearEndRule: YearEndRule.RESET,
  carryForwardMax: 0,
  allowOverBalanceRequest: true,
  defaultExtraLeaveType: ExtraLeaveType.UNPAID,
  maxExtraDaysWarning: 5,
  pendingReminderAfterDays: 2,
};
