import { model, Schema } from "mongoose";
import {
  ExtraLeaveType,
  HalfDaySession,
  LeaveAuditAction,
  LeaveStatus,
  LeaveType,
  TimelineAction,
  YearEndRule,
  DEFAULT_POLICY,
} from "./leave.constant";
import {
  ILeaveAuditLog,
  ILeaveBalance,
  ILeavePolicy,
  ILeaveRequest,
} from "./leave.interface";

/* -------------------------------------------------------------------------- */
/* LeaveRequest                                                               */
/* -------------------------------------------------------------------------- */

const leaveRequestSchema = new Schema<ILeaveRequest>(
  {
    staff: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    leaveType: { type: String, enum: Object.values(LeaveType), required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    halfDaySession: { type: String, enum: Object.values(HalfDaySession) },
    leaveTime: { type: String, trim: true },
    expectedArrivalTime: { type: String, trim: true },
    reason: { type: String, trim: true, default: "" },
    emergencyContact: { type: String, trim: true },
    attachments: [
      {
        _id: false,
        url: { type: String, required: true },
        name: { type: String, required: true },
      },
    ],
    status: {
      type: String,
      enum: Object.values(LeaveStatus),
      default: LeaveStatus.PENDING,
      index: true,
    },

    totalDays: { type: Number, required: true, min: 0, default: 0 },
    paidDays: { type: Number, required: true, min: 0, default: 0 },
    extraDays: { type: Number, required: true, min: 0, default: 0 },

    extraLeaveType: { type: String, enum: Object.values(ExtraLeaveType) },
    extraApprovedBy: { type: Schema.Types.ObjectId, ref: "User" },
    extraApprovalNote: { type: String, trim: true },

    decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    decidedAt: { type: Date },
    decisionNote: { type: String, trim: true },
    rejectReason: { type: String, trim: true },

    recommendations: [
      {
        _id: false,
        by: { type: Schema.Types.ObjectId, ref: "User", required: true },
        note: { type: String, required: true, trim: true },
        at: { type: Date, default: Date.now },
      },
    ],
    timeline: [
      {
        _id: false,
        action: { type: String, enum: Object.values(TimelineAction), required: true },
        by: { type: Schema.Types.ObjectId, ref: "User", required: true },
        at: { type: Date, default: Date.now },
        note: { type: String, trim: true },
      },
    ],

    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, versionKey: false },
);

leaveRequestSchema.index({ staff: 1, status: 1 });
leaveRequestSchema.index({ startDate: 1, endDate: 1 });
leaveRequestSchema.index({ status: 1, createdAt: -1 });

export const LeaveRequest = model<ILeaveRequest>("LeaveRequest", leaveRequestSchema);

/* -------------------------------------------------------------------------- */
/* LeaveBalance                                                               */
/* -------------------------------------------------------------------------- */

const leaveBalanceSchema = new Schema<ILeaveBalance>(
  {
    staff: { type: Schema.Types.ObjectId, ref: "User", required: true },
    year: { type: Number, required: true },
    totalQuota: { type: Number, required: true, default: 0 },
    carriedForward: { type: Number, required: true, default: 0 },
    used: { type: Number, required: true, default: 0 },
    advanceUsed: { type: Number, required: true, default: 0 },
    adjustments: [
      {
        _id: false,
        field: { type: String, enum: ["totalQuota", "carriedForward"], required: true },
        amount: { type: Number, required: true },
        reason: { type: String, required: true, trim: true },
        by: { type: Schema.Types.ObjectId, ref: "User", required: true },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true, versionKey: false },
);

leaveBalanceSchema.index({ staff: 1, year: 1 }, { unique: true });

export const LeaveBalance = model<ILeaveBalance>("LeaveBalance", leaveBalanceSchema);

/* -------------------------------------------------------------------------- */
/* LeavePolicy (singleton)                                                    */
/* -------------------------------------------------------------------------- */

const leavePolicySchema = new Schema<ILeavePolicy>(
  {
    key: { type: String, enum: ["singleton"], default: "singleton", unique: true },
    annualLeaveQuota: { type: Number, default: DEFAULT_POLICY.annualLeaveQuota, min: 0 },
    staffQuotaOverrides: [
      {
        _id: false,
        staff: { type: Schema.Types.ObjectId, ref: "User", required: true },
        quota: { type: Number, required: true, min: 0 },
      },
    ],
    weeklyOffDays: { type: [Number], default: DEFAULT_POLICY.weeklyOffDays },
    publicHolidays: [
      {
        _id: false,
        date: { type: String, required: true }, // YYYY-MM-DD
        name: { type: String, required: true, trim: true },
      },
    ],
    minAdvanceNoticeDays: { type: Number, default: DEFAULT_POLICY.minAdvanceNoticeDays, min: 0 },
    allowPastDateRequestsAdminOnly: { type: Boolean, default: true },
    yearEndRule: {
      type: String,
      enum: Object.values(YearEndRule),
      default: DEFAULT_POLICY.yearEndRule,
    },
    carryForwardMax: { type: Number, default: DEFAULT_POLICY.carryForwardMax, min: 0 },
    // Always true: staff may apply with an exhausted balance. Kept as a field for transparency.
    allowOverBalanceRequest: { type: Boolean, default: true },
    defaultExtraLeaveType: {
      type: String,
      enum: Object.values(ExtraLeaveType),
      default: DEFAULT_POLICY.defaultExtraLeaveType,
    },
    maxExtraDaysWarning: { type: Number, default: DEFAULT_POLICY.maxExtraDaysWarning, min: 0 },
    pendingReminderAfterDays: {
      type: Number,
      default: DEFAULT_POLICY.pendingReminderAfterDays,
      min: 1,
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, versionKey: false },
);

export const LeavePolicy = model<ILeavePolicy>("LeavePolicy", leavePolicySchema);

/* -------------------------------------------------------------------------- */
/* LeaveAuditLog                                                              */
/* -------------------------------------------------------------------------- */

const leaveAuditLogSchema = new Schema<ILeaveAuditLog>(
  {
    action: { type: String, enum: Object.values(LeaveAuditAction), required: true, index: true },
    performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetStaff: { type: Schema.Types.ObjectId, ref: "User", index: true },
    targetRequest: { type: Schema.Types.ObjectId, ref: "LeaveRequest", index: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    note: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

leaveAuditLogSchema.index({ createdAt: -1 });

export const LeaveAuditLog = model<ILeaveAuditLog>("LeaveAuditLog", leaveAuditLogSchema);
