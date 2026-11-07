import { Types } from "mongoose";
import {
  ExtraLeaveType,
  HalfDaySession,
  LeaveAuditAction,
  LeaveStatus,
  LeaveType,
  TimelineAction,
  YearEndRule,
} from "./leave.constant";

export interface ILeaveAttachment {
  url: string;
  name: string;
}

export interface ILeaveRecommendation {
  by: Types.ObjectId;
  note: string;
  at: Date;
}

export interface ILeaveTimelineEntry {
  action: TimelineAction;
  by: Types.ObjectId;
  at: Date;
  note?: string;
}

export interface ILeaveRequest {
  _id?: Types.ObjectId;
  staff: Types.ObjectId;
  leaveType: LeaveType;
  /** Stored at UTC midnight of the calendar day. */
  startDate: Date;
  endDate: Date;
  halfDaySession?: HalfDaySession;
  leaveTime?: string; // HH:mm, early_leave
  expectedArrivalTime?: string; // HH:mm, late_arrival
  reason?: string;
  emergencyContact?: string;
  attachments: ILeaveAttachment[];
  status: LeaveStatus;

  totalDays: number;
  paidDays: number;
  extraDays: number;

  extraLeaveType?: ExtraLeaveType;
  extraApprovedBy?: Types.ObjectId;
  extraApprovalNote?: string;

  decidedBy?: Types.ObjectId;
  decidedAt?: Date;
  decisionNote?: string;
  rejectReason?: string;

  recommendations: ILeaveRecommendation[];
  timeline: ILeaveTimelineEntry[];

  createdBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ILeaveBalanceAdjustment {
  field: "totalQuota" | "carriedForward";
  amount: number;
  reason: string;
  by: Types.ObjectId;
  at: Date;
}

export interface ILeaveBalance {
  _id?: Types.ObjectId;
  staff: Types.ObjectId;
  year: number;
  totalQuota: number;
  carriedForward: number;
  used: number;
  advanceUsed: number;
  adjustments: ILeaveBalanceAdjustment[];
}

export interface ILeavePolicy {
  _id?: Types.ObjectId;
  key: "singleton";
  annualLeaveQuota: number;
  staffQuotaOverrides: { staff: Types.ObjectId; quota: number }[];
  weeklyOffDays: number[];
  publicHolidays: { date: string; name: string }[];
  minAdvanceNoticeDays: number;
  allowPastDateRequestsAdminOnly: boolean;
  yearEndRule: YearEndRule;
  carryForwardMax: number;
  allowOverBalanceRequest: boolean;
  defaultExtraLeaveType: ExtraLeaveType;
  maxExtraDaysWarning: number;
  pendingReminderAfterDays: number;
  updatedBy?: Types.ObjectId;
}

export interface ILeaveAuditLog {
  _id?: Types.ObjectId;
  action: LeaveAuditAction;
  performedBy: Types.ObjectId;
  targetStaff?: Types.ObjectId;
  targetRequest?: Types.ObjectId;
  before?: unknown;
  after?: unknown;
  note?: string;
  createdAt?: Date;
}

/** The logged-in user as carried in the access token. */
export interface LeaveActor {
  userId: string;
  role: string;
}
