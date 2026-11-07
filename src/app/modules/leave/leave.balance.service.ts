import { ClientSession, Types } from "mongoose";
import AppError from "../../errorHelpers/appError";
import { User } from "../user/user.model";
import { ExtraLeaveType, LEAVE_TYPE_RULES, LeaveAuditAction, LeaveType } from "./leave.constant";
import { ILeaveBalance, ILeaveRequest } from "./leave.interface";
import { LeaveAuditLog, LeaveBalance, LeaveRequest } from "./leave.model";
import { LeavePolicyService } from "./leave.policy.service";
import { LeaveStatus } from "./leave.constant";
import { todayInBusinessTz } from "./leave.utils";

export const remainingOf = (b: Pick<ILeaveBalance, "totalQuota" | "carriedForward" | "used">) =>
  b.totalQuota + b.carriedForward - b.used;

/** Default quota for a staff member: per-staff override first, then the global default. */
const quotaFor = async (staffId: string | Types.ObjectId, session?: ClientSession) => {
  const policy = await LeavePolicyService.getPolicy(session);
  const override = policy.staffQuotaOverrides.find((o) => o.staff.toString() === staffId.toString());
  return override ? override.quota : policy.annualLeaveQuota;
};

/** Loads the balance for (staff, year) or creates it from the policy. Safe under concurrency. */
const getOrCreateBalance = async (
  staffId: string | Types.ObjectId,
  year: number,
  session?: ClientSession,
) => {
  const existing = await LeaveBalance.findOne({ staff: staffId, year }).session(session ?? null);
  if (existing) {
    // A balance stores the quota that applied when it was created, so a later policy change
    // (e.g. 20 -> 24 days) would never reach it. The stored quota is always
    // "policy quota + recorded quota adjustments", so recompute it for the current and
    // future years. Past years are history and stay as they were.
    if (year >= todayInBusinessTz().getUTCFullYear()) {
      const adjusted = existing.adjustments
        .filter((a) => a.field === "totalQuota")
        .reduce((sum, a) => sum + a.amount, 0);
      const expected = Math.max((await quotaFor(staffId, session)) + adjusted, 0);
      if (existing.totalQuota !== expected) {
        existing.totalQuota = expected;
        await existing.save({ session });
      }
    }
    return existing;
  }

  const totalQuota = await quotaFor(staffId, session);
  try {
    const [created] = await LeaveBalance.create([{ staff: staffId, year, totalQuota }], { session });
    return created;
  } catch (error) {
    const again = await LeaveBalance.findOne({ staff: staffId, year }).session(session ?? null);
    if (again) return again;
    throw error;
  }
};

/** Whole-day balance figures plus how many extra days are already approved this year. */
const getBalanceSummary = async (staffId: string, year: number) => {
  const balance = await getOrCreateBalance(staffId, year);
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31));

  const grouped = await LeaveRequest.aggregate([
    {
      $match: {
        staff: new Types.ObjectId(staffId),
        status: { $in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] },
        startDate: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: "$status",
        extraDays: { $sum: "$extraDays" },
        totalDays: { $sum: "$totalDays" },
        count: { $sum: 1 },
      },
    },
  ]);
  const pick = (s: LeaveStatus) => grouped.find((g) => g._id === s);

  return {
    staff: balance.staff,
    year,
    totalQuota: balance.totalQuota,
    carriedForward: balance.carriedForward,
    used: balance.used,
    advanceUsed: balance.advanceUsed,
    remaining: remainingOf(balance),
    /** Extra (over-balance) days in approved requests this year. */
    extraDays: pick(LeaveStatus.APPROVED)?.extraDays ?? 0,
    pendingCount: pick(LeaveStatus.PENDING)?.count ?? 0,
    pendingDays: pick(LeaveStatus.PENDING)?.totalDays ?? 0,
    pendingExtraDays: pick(LeaveStatus.PENDING)?.extraDays ?? 0,
    adjustments: balance.adjustments,
  };
};

/**
 * Splits the requested days into paid (from balance) and extra (over balance).
 * Unpaid and record-only types never touch the balance.
 */
export const splitDays = (
  leaveType: LeaveType,
  totalDays: number,
  remaining: number,
): { paidDays: number; extraDays: number } => {
  if (!LEAVE_TYPE_RULES[leaveType].deductsBalance) return { paidDays: 0, extraDays: 0 };
  const available = Math.max(remaining, 0);
  const paidDays = Math.min(totalDays, available);
  return { paidDays, extraDays: totalDays - paidDays };
};

/** What the request would split into right now (used at submit time, no side effects). */
const previewSplit = async (staffId: string, leaveType: LeaveType, year: number, totalDays: number) => {
  const balance = await getOrCreateBalance(staffId, year);
  const remaining = remainingOf(balance);
  return { remaining, ...splitDays(leaveType, totalDays, remaining) };
};

/**
 * Applies an approved request to the balance. Must run inside a transaction.
 * `used` grows by paidDays; extra days become advance debt on next year's quota,
 * or are recorded only (unpaid / waived).
 */
const applyApproval = async (
  request: Pick<ILeaveRequest, "staff" | "startDate" | "paidDays" | "extraDays" | "extraLeaveType">,
  actorId: string,
  session: ClientSession,
) => {
  const year = request.startDate.getUTCFullYear();
  const balance = await getOrCreateBalance(request.staff, year, session);

  if (request.paidDays > 0) balance.used += request.paidDays;

  if (request.extraDays > 0 && request.extraLeaveType === ExtraLeaveType.ADVANCE) {
    balance.advanceUsed += request.extraDays;
    const next = await getOrCreateBalance(request.staff, year + 1, session);
    next.totalQuota = Math.max(next.totalQuota - request.extraDays, 0);
    next.adjustments.push({
      field: "totalQuota",
      amount: -request.extraDays,
      reason: `Advance leave taken in ${year}`,
      by: new Types.ObjectId(actorId),
      at: new Date(),
    });
    await next.save({ session });
  }
  await balance.save({ session });
};

/** Exact inverse of applyApproval (used when an approved request is edited). */
const reverseApproval = async (
  request: Pick<ILeaveRequest, "staff" | "startDate" | "paidDays" | "extraDays" | "extraLeaveType">,
  actorId: string,
  session: ClientSession,
) => {
  const year = request.startDate.getUTCFullYear();
  const balance = await getOrCreateBalance(request.staff, year, session);

  if (request.paidDays > 0) balance.used = Math.max(balance.used - request.paidDays, 0);

  if (request.extraDays > 0 && request.extraLeaveType === ExtraLeaveType.ADVANCE) {
    balance.advanceUsed = Math.max(balance.advanceUsed - request.extraDays, 0);
    const next = await getOrCreateBalance(request.staff, year + 1, session);
    next.totalQuota += request.extraDays;
    next.adjustments.push({
      field: "totalQuota",
      amount: request.extraDays,
      reason: `Advance leave from ${year} reversed`,
      by: new Types.ObjectId(actorId),
      at: new Date(),
    });
    await next.save({ session });
  }
  await balance.save({ session });
};

const adjustBalance = async (
  staffId: string,
  payload: { year?: number; field: "totalQuota" | "carriedForward"; amount: number; reason: string },
  actorId: string,
) => {
  const staff = await User.findOne({ _id: staffId, isDeleted: false });
  if (!staff) throw new AppError(404, "Staff member not found");

  const year = payload.year ?? new Date().getUTCFullYear();
  const balance = await getOrCreateBalance(staffId, year);
  const before = balance.toObject();

  const next = balance[payload.field] + payload.amount;
  if (next < 0) throw new AppError(400, `${payload.field} cannot become negative`);

  balance[payload.field] = next;
  balance.adjustments.push({
    field: payload.field,
    amount: payload.amount,
    reason: payload.reason,
    by: new Types.ObjectId(actorId),
    at: new Date(),
  });
  await balance.save();

  await LeaveAuditLog.create({
    action: LeaveAuditAction.BALANCE_ADJUSTED,
    performedBy: actorId,
    targetStaff: staffId,
    before,
    after: balance.toObject(),
    note: payload.reason,
  });

  return getBalanceSummary(staffId, year);
};

export const LeaveBalanceService = {
  getOrCreateBalance,
  getBalanceSummary,
  previewSplit,
  applyApproval,
  reverseApproval,
  adjustBalance,
};
