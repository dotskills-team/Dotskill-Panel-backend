import { QueryFilter, Types } from "mongoose";
import AppError from "../../errorHelpers/appError";
import { Role } from "../user/user.interface";
import { User } from "../user/user.model";
import {
  ADMIN_ROLES,
  APPROVER_ROLES,
  DAY_CONSUMING_TYPES,
  LeaveStatus,
} from "./leave.constant";
import { ILeaveRequest, LeaveActor } from "./leave.interface";
import { LeaveBalanceService } from "./leave.balance.service";
import { LeaveRequest } from "./leave.model";
import { LeavePolicyService } from "./leave.policy.service";
import { addDays, diffInDays, parseDay, toDayString, todayInBusinessTz } from "./leave.utils";

const MAX_RANGE_DAYS = 93;

const isApprover = (role: string) => APPROVER_ROLES.includes(role);

const fullName = (u?: { firstName?: string; lastName?: string } | null) =>
  `${u?.firstName ?? ""} ${u?.lastName ?? ""}`.trim() || "Unknown";

const assertRange = (from: string, to: string) => {
  const start = parseDay(from);
  const end = parseDay(to);
  if (end.getTime() < start.getTime()) throw new AppError(400, "'to' cannot be before 'from'");
  if (diffInDays(start, end) > MAX_RANGE_DAYS) {
    throw new AppError(400, `Range cannot exceed ${MAX_RANGE_DAYS} days`);
  }
  return { start, end };
};

/* -------------------------------------------------------------------------- */
/* Team calendar                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Team calendar for a date range. Everyone sees approved leave. Approvers also see
 * pending requests, the leave type and the day count. Staff get name, department and
 * dates only (never the reason or type), with extra-leave days flagged.
 */
const getCalendar = async (actor: LeaveActor, from: string, to: string) => {
  const { start, end } = assertRange(from, to);
  const approver = isApprover(actor.role);

  const filter: QueryFilter<ILeaveRequest> = {
    status: approver ? { $in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] } : LeaveStatus.APPROVED,
    leaveType: { $in: DAY_CONSUMING_TYPES },
    startDate: { $lte: end },
    endDate: { $gte: start },
  };

  const [requests, policy] = await Promise.all([
    LeaveRequest.find(filter)
      .populate("staff", "firstName lastName department")
      .sort({ startDate: 1 }),
    LeavePolicyService.getPolicy(),
  ]);

  const entries = requests.map((r) => {
    const staff = r.staff as unknown as {
      _id: Types.ObjectId;
      firstName?: string;
      lastName?: string;
      department?: string;
    };
    const base = {
      _id: r._id,
      staff: { _id: staff._id, name: fullName(staff), department: staff.department ?? null },
      startDate: r.startDate,
      endDate: r.endDate,
      halfDaySession: r.halfDaySession ?? null,
      isExtra: r.extraDays > 0,
    };
    return approver
      ? { ...base, leaveType: r.leaveType, status: r.status, totalDays: r.totalDays, extraDays: r.extraDays }
      : base;
  });

  return {
    from,
    to,
    entries,
    weeklyOffDays: policy.weeklyOffDays,
    publicHolidays: policy.publicHolidays,
  };
};

/* -------------------------------------------------------------------------- */
/* Conflicts (approver warning)                                               */
/* -------------------------------------------------------------------------- */

/**
 * How many colleagues are already on approved leave on each day of the range.
 * `excludeRequestId` leaves the request being reviewed out of the count, and
 * `department` narrows the count to one team.
 */
const getConflicts = async (
  actor: LeaveActor,
  q: { from: string; to: string; department?: string; excludeRequestId?: string },
) => {
  if (!isApprover(actor.role)) throw new AppError(403, "Only approvers can check conflicts");
  const { start, end } = assertRange(q.from, q.to);

  const filter: QueryFilter<ILeaveRequest> = {
    status: LeaveStatus.APPROVED,
    leaveType: { $in: DAY_CONSUMING_TYPES },
    startDate: { $lte: end },
    endDate: { $gte: start },
  };
  if (q.excludeRequestId) filter._id = { $ne: q.excludeRequestId };

  if (q.department) {
    const escaped = q.department.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const ids = await User.find({
      department: new RegExp(`^${escaped}$`, "i"),
      isDeleted: false,
    }).distinct("_id");
    filter.staff = { $in: ids };
  }

  const leaves = await LeaveRequest.find(filter).populate("staff", "firstName lastName");

  const days: { date: string; count: number; people: string[] }[] = [];
  const everyone = new Set<string>();

  for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    const people = new Set<string>();
    for (const l of leaves) {
      if (l.startDate.getTime() <= d.getTime() && l.endDate.getTime() >= d.getTime()) {
        const staff = l.staff as unknown as { _id: Types.ObjectId; firstName?: string; lastName?: string };
        people.add(fullName(staff));
        everyone.add(staff._id.toString());
      }
    }
    if (people.size > 0) {
      days.push({ date: toDayString(d), count: people.size, people: Array.from(people) });
    }
  }

  return {
    days,
    maxCount: days.reduce((m, d) => Math.max(m, d.count), 0),
    peopleCount: everyone.size,
  };
};

/* -------------------------------------------------------------------------- */
/* Dashboard summary                                                          */
/* -------------------------------------------------------------------------- */

const getDashboardSummary = async (actor: LeaveActor) => {
  const today = todayInBusinessTz();
  const admin = ADMIN_ROLES.includes(actor.role);

  // Admins do not request leave, so they have no personal balance block.
  const personal = admin
    ? null
    : await (async () => {
        const [balance, nextLeave, pendingCount] = await Promise.all([
          LeaveBalanceService.getBalanceSummary(actor.userId, today.getUTCFullYear()),
          LeaveRequest.findOne({
            staff: actor.userId,
            status: LeaveStatus.APPROVED,
            leaveType: { $in: DAY_CONSUMING_TYPES },
            endDate: { $gte: today },
          })
            .sort({ startDate: 1 })
            .select("leaveType startDate endDate totalDays extraDays"),
          LeaveRequest.countDocuments({ staff: actor.userId, status: LeaveStatus.PENDING }),
        ]);
        return {
          balance: {
            totalQuota: balance.totalQuota + balance.carriedForward,
            used: balance.used,
            remaining: balance.remaining,
            extraDays: balance.extraDays,
          },
          nextLeave,
          pendingCount,
        };
      })();

  if (!isApprover(actor.role)) return { personal, team: null };

  // Pending items this person could actually act on: not their own, and managers
  // cannot decide manager/admin requests.
  const blockedRequesters = admin
    ? []
    : await User.find({ role: { $in: [Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN] } }).distinct("_id");
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));

  const [onLeaveToday, pendingApprovals, topRaw] = await Promise.all([
    LeaveRequest.find({
      status: LeaveStatus.APPROVED,
      leaveType: { $in: DAY_CONSUMING_TYPES },
      startDate: { $lte: today },
      endDate: { $gte: today },
    })
      .populate("staff", "firstName lastName department")
      .select("staff leaveType endDate halfDaySession extraDays"),
    LeaveRequest.countDocuments({
      status: LeaveStatus.PENDING,
      staff: { $nin: [new Types.ObjectId(actor.userId), ...blockedRequesters] },
    }),
    LeaveRequest.aggregate([
      {
        $match: {
          status: LeaveStatus.APPROVED,
          startDate: { $gte: monthStart, $lte: monthEnd },
        },
      },
      { $group: { _id: "$staff", totalDays: { $sum: "$totalDays" }, requests: { $sum: 1 } } },
      { $sort: { totalDays: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const users = await User.find({ _id: { $in: topRaw.map((t) => t._id) } }).select("firstName lastName");
  const nameById = new Map(users.map((u) => [u._id.toString(), fullName(u)]));

  return {
    personal,
    team: {
      onLeaveToday: onLeaveToday.map((r) => {
        const staff = r.staff as unknown as { _id: Types.ObjectId; firstName?: string; lastName?: string; department?: string };
        return {
          staffId: staff._id,
          name: fullName(staff),
          department: staff.department ?? null,
          leaveType: r.leaveType,
          until: r.endDate,
          halfDaySession: r.halfDaySession ?? null,
          isExtra: r.extraDays > 0,
        };
      }),
      pendingApprovals,
      topLeaveTakers: topRaw.map((t) => ({
        staffId: t._id,
        name: nameById.get(t._id.toString()) ?? "Unknown",
        totalDays: t.totalDays,
        requests: t.requests,
      })),
    },
  };
};

export const LeaveCalendarService = { getCalendar, getConflicts, getDashboardSummary };
