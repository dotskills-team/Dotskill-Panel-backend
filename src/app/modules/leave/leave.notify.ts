/* eslint-disable no-console */
import { Role } from "../user/user.interface";
import { NotificationService } from "../notification/notification.service";
import { ADMIN_ROLES, APPROVER_ROLES, LEAVE_TYPE_LABELS } from "./leave.constant";
import { toDayString } from "./leave.utils";

const LINK = "/dashboard/leave";

interface RequestInfo {
  id: string;
  staffId: string;
  staffName: string;
  staffRole: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  extraDays?: number;
}

const when = (r: Pick<RequestInfo, "startDate" | "endDate">) => {
  const s = toDayString(r.startDate);
  const e = toDayString(r.endDate);
  return s === e ? s : `${s} to ${e}`;
};

const label = (type: string) => LEAVE_TYPE_LABELS[type] ?? type;

/** Notifications must never break the action that triggered them. */
const safely = async (work: () => Promise<unknown>) => {
  try {
    await work();
  } catch (error) {
    console.error("[leave notify] failed:", error);
  }
};

/** Who can decide a request from this requester (mirrors the approval rules). */
export const deciderRoles = (requesterRole: string): string[] =>
  requesterRole === Role.MANAGER ? ADMIN_ROLES : APPROVER_ROLES;

const submitted = (r: RequestInfo) =>
  safely(async () => {
    const recipients = await NotificationService.recipientsByRole(deciderRoles(r.staffRole), [r.staffId]);
    await NotificationService.notify(recipients, {
      type: "leave.submitted",
      title: "New leave request",
      message: `${r.staffName} requested ${label(r.leaveType)} (${when(r)})${
        r.extraDays ? ` · ${r.extraDays} extra day(s)` : ""
      }`,
      link: LINK,
    });
  });

const decided = (r: RequestInfo, approved: boolean, reason?: string) =>
  safely(() =>
    NotificationService.notify([r.staffId], {
      type: approved ? "leave.approved" : "leave.rejected",
      title: approved ? "Leave approved" : "Leave rejected",
      message: approved
        ? `Your ${label(r.leaveType)} request (${when(r)}) was approved.`
        : `Your ${label(r.leaveType)} request (${when(r)}) was rejected${reason ? `: ${reason}` : "."}`,
      link: LINK,
    }),
  );

const edited = (r: RequestInfo) =>
  safely(() =>
    NotificationService.notify([r.staffId], {
      type: "leave.edited",
      title: "Leave request updated",
      message: `Your ${label(r.leaveType)} request was updated: ${when(r)}.`,
      link: LINK,
    }),
  );

const recommended = (r: RequestInfo, managerName: string) =>
  safely(async () => {
    const admins = await NotificationService.recipientsByRole(ADMIN_ROLES);
    await NotificationService.notify(admins, {
      type: "leave.recommended",
      title: "Recommendation on over-balance leave",
      message: `${managerName} added a recommendation on ${r.staffName}'s ${label(r.leaveType)} request (${when(r)}).`,
      link: LINK,
    });
  });

export const LeaveNotify = { submitted, decided, edited, recommended };
