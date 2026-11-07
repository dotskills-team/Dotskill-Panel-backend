import { Types } from "mongoose";
import { Role, UserStatus } from "../user/user.interface";
import { User } from "../user/user.model";
import { NotificationService } from "../notification/notification.service";
import {
  ADMIN_ROLES,
  DAY_CONSUMING_TYPES,
  LEAVE_TYPE_LABELS,
  LeaveStatus,
  YearEndRule,
} from "./leave.constant";
import { LeaveBalance, LeaveRequest } from "./leave.model";
import { LeaveBalanceService, remainingOf } from "./leave.balance.service";
import { deciderRoles } from "./leave.notify";
import { LeavePolicyService } from "./leave.policy.service";
import { addDays, toDayString, todayInBusinessTz } from "./leave.utils";

const LINK = "/dashboard/leave";

/**
 * (a) The day before approved leave starts, remind the staff member.
 * Safe to run repeatedly: the dedupe key allows one reminder per request.
 */
export const sendUpcomingLeaveReminders = async () => {
  const tomorrow = addDays(todayInBusinessTz(), 1);
  const requests = await LeaveRequest.find({
    status: LeaveStatus.APPROVED,
    leaveType: { $in: DAY_CONSUMING_TYPES },
    startDate: tomorrow,
  });

  let created = 0;
  for (const r of requests) {
    const span =
      toDayString(r.startDate) === toDayString(r.endDate)
        ? "tomorrow"
        : `from tomorrow until ${toDayString(r.endDate)}`;
    created += await NotificationService.notify([r.staff.toString()], {
      type: "leave.reminder",
      title: "Leave starts tomorrow",
      message: `Your ${LEAVE_TYPE_LABELS[r.leaveType] ?? "leave"} starts ${span}.`,
      link: LINK,
      dedupeKey: `leave-start:${r._id}`,
    });
  }
  return { requests: requests.length, notificationsCreated: created };
};

/**
 * (b) Remind approvers about requests pending longer than the policy limit.
 * One reminder per request per day, sent to the people who can decide it.
 */
export const sendStalePendingReminders = async () => {
  const policy = await LeavePolicyService.getPolicy();
  const cutoff = new Date(Date.now() - policy.pendingReminderAfterDays * 24 * 60 * 60 * 1000);
  const today = toDayString(todayInBusinessTz());

  const stale = await LeaveRequest.find({
    status: LeaveStatus.PENDING,
    createdAt: { $lte: cutoff },
  }).populate("staff", "firstName lastName role");

  let created = 0;
  for (const r of stale) {
    const staff = r.staff as unknown as { _id: Types.ObjectId; firstName?: string; lastName?: string; role?: string };
    const recipients = await NotificationService.recipientsByRole(deciderRoles(staff.role ?? ""), [
      staff._id.toString(),
    ]);
    const days = Math.floor((Date.now() - (r.createdAt?.getTime() ?? Date.now())) / (24 * 60 * 60 * 1000));
    created += await NotificationService.notify(recipients, {
      type: "leave.stale",
      title: "Leave request waiting",
      message: `${`${staff.firstName ?? ""} ${staff.lastName ?? ""}`.trim()}'s ${
        LEAVE_TYPE_LABELS[r.leaveType] ?? "leave"
      } request has been pending for ${days} day(s).`,
      link: LINK,
      dedupeKey: `leave-stale:${r._id}:${today}`,
    });
  }
  return { requests: stale.length, notificationsCreated: created };
};

/**
 * (c) Creates `year` balances from the previous year's leftovers, per the policy.
 * Idempotent: carry-forward is only written while the new balance still has none.
 */
export const runYearlyRollover = async (year = todayInBusinessTz().getUTCFullYear()) => {
  const policy = await LeavePolicyService.getPolicy();
  const members = await User.find({
    isDeleted: false,
    status: UserStatus.ACTIVE,
    role: { $nin: ADMIN_ROLES as Role[] }, // admins do not take leave
  }).select("_id");

  let processed = 0;
  let carried = 0;
  for (const m of members) {
    const prev = await LeaveBalanceService.getOrCreateBalance(m._id, year - 1);
    const current = await LeaveBalanceService.getOrCreateBalance(m._id, year);

    if (policy.yearEndRule === YearEndRule.CARRY_FORWARD && current.carriedForward === 0) {
      const carry = Math.min(Math.max(remainingOf(prev), 0), policy.carryForwardMax);
      if (carry > 0) {
        const res = await LeaveBalance.updateOne(
          { _id: current._id, carriedForward: 0 },
          { $set: { carriedForward: carry } },
        );
        if (res.modifiedCount) carried += 1;
      }
    }
    processed += 1;
  }
  return { year, processed, carried };
};

export const runAllLeaveJobs = async () => ({
  reminders: await sendUpcomingLeaveReminders(),
  stale: await sendStalePendingReminders(),
});

