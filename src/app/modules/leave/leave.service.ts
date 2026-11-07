import mongoose, { ClientSession, QueryFilter, Types } from "mongoose";
import AppError from "../../errorHelpers/appError";
import { Role, UserStatus } from "../user/user.interface";
import { User } from "../user/user.model";
import {
  ADMIN_ROLES,
  ExtraLeaveType,
  HalfDaySession,
  LEAVE_TYPE_RULES,
  LeaveAuditAction,
  LeaveStatus,
  LeaveType,
  DAY_CONSUMING_TYPES,
  TimelineAction,
} from "./leave.constant";
import { ILeaveRequest, ILeaveTimelineEntry, LeaveActor } from "./leave.interface";
import { LeaveAuditLog, LeaveRequest } from "./leave.model";
import { LeaveBalanceService, remainingOf, splitDays } from "./leave.balance.service";
import { LeavePolicyService } from "./leave.policy.service";
import { LeaveNotify } from "./leave.notify";
import {
  countWorkingDays,
  diffInDays,
  isOffDay,
  parseDay,
  todayInBusinessTz,
} from "./leave.utils";

/* -------------------------------------------------------------------------- */
/* Role helpers                                                               */
/* -------------------------------------------------------------------------- */

const isAdminRole = (role: string) => ADMIN_ROLES.includes(role);
const isApprover = (role: string) => isAdminRole(role) || role === Role.MANAGER;

const staffPopulate = {
  path: "staff",
  select: "firstName lastName fullName email role designation department avatar",
};

const detailPopulate = [
  staffPopulate,
  { path: "decidedBy", select: "firstName lastName fullName role" },
  { path: "extraApprovedBy", select: "firstName lastName fullName role" },
  { path: "recommendations.by", select: "firstName lastName fullName role" },
  { path: "timeline.by", select: "firstName lastName fullName role" },
];

const timelineEntry = (
  action: TimelineAction,
  by: string,
  note?: string,
): ILeaveTimelineEntry => ({
  action,
  by: new Types.ObjectId(by),
  at: new Date(),
  note,
});

/**
 * Who may decide a request (separation of duties):
 *  - nobody decides their own request
 *  - staff request       -> manager, admin, super admin
 *  - manager request     -> admin, super admin
 *  - admin request       -> another admin or a super admin
 *  - super admin request -> another super admin
 */
const assertCanDecide = (actor: LeaveActor, requesterId: string, requesterRole: string) => {
  if (actor.userId === requesterId) {
    throw new AppError(403, "You cannot approve or reject your own request");
  }
  if (!isApprover(actor.role)) {
    throw new AppError(403, "You are not allowed to decide leave requests");
  }
  if (requesterRole === Role.SUPER_ADMIN && actor.role !== Role.SUPER_ADMIN) {
    throw new AppError(403, "Only another super admin can decide a super admin's request");
  }
  if (requesterRole === Role.ADMIN && !isAdminRole(actor.role)) {
    throw new AppError(403, "Only an admin or super admin can decide an admin's request");
  }
  if (requesterRole === Role.MANAGER && !isAdminRole(actor.role)) {
    throw new AppError(403, "Only an admin or super admin can decide a manager's request");
  }
};

/* -------------------------------------------------------------------------- */
/* Building and validating request data                                       */
/* -------------------------------------------------------------------------- */

interface RequestInput {
  leaveType: LeaveType;
  startDate: string;
  endDate?: string;
  halfDaySession?: HalfDaySession;
  leaveTime?: string;
  expectedArrivalTime?: string;
  reason?: string;
  emergencyContact?: string;
  attachments?: { url: string; name: string }[];
}

interface BuiltRequest {
  leaveType: LeaveType;
  startDate: Date;
  endDate: Date;
  halfDaySession?: HalfDaySession;
  leaveTime?: string;
  expectedArrivalTime?: string;
  reason?: string;
  emergencyContact?: string;
  attachments?: { url: string; name: string }[];
  totalDays: number;
}

type PolicyForDays = Awaited<ReturnType<typeof LeavePolicyService.getPolicy>>;

/** Checks the type-specific fields and computes the dates and total days. */
const buildRequestData = (input: RequestInput, policy: PolicyForDays): BuiltRequest => {
  const rules = LEAVE_TYPE_RULES[input.leaveType];
  const startDate = parseDay(input.startDate);
  const endDate = rules.singleDay ? startDate : parseDay(input.endDate ?? input.startDate);

  if (endDate.getTime() < startDate.getTime()) {
    throw new AppError(400, "End date cannot be before the start date");
  }
  if (startDate.getUTCFullYear() !== endDate.getUTCFullYear()) {
    throw new AppError(400, "A request cannot span two years. Please submit one request per year.");
  }
  if (diffInDays(startDate, endDate) > 365) {
    throw new AppError(400, "Date range is too long");
  }

  if (input.leaveType === LeaveType.HALF_DAY && !input.halfDaySession) {
    throw new AppError(400, "Please choose morning or afternoon for a half day");
  }
  if (input.leaveType === LeaveType.EARLY_LEAVE && !input.leaveTime) {
    throw new AppError(400, "Leave time is required for early leave");
  }
  if (input.leaveType === LeaveType.LATE_ARRIVAL && !input.expectedArrivalTime) {
    throw new AppError(400, "Expected arrival time is required for late arrival");
  }

  let totalDays = 0;
  if (rules.countsDays) {
    if (input.leaveType === LeaveType.HALF_DAY) {
      if (isOffDay(startDate, policy)) {
        throw new AppError(400, "The selected day is an off day or public holiday");
      }
      totalDays = 0.5;
    } else {
      totalDays = countWorkingDays(startDate, endDate, policy);
      if (totalDays === 0) {
        throw new AppError(400, "All selected dates are off days or public holidays");
      }
    }
  }

  return {
    leaveType: input.leaveType,
    startDate,
    endDate,
    halfDaySession: input.leaveType === LeaveType.HALF_DAY ? input.halfDaySession : undefined,
    leaveTime: input.leaveType === LeaveType.EARLY_LEAVE ? input.leaveTime : undefined,
    expectedArrivalTime:
      input.leaveType === LeaveType.LATE_ARRIVAL ? input.expectedArrivalTime : undefined,
    reason: input.reason,
    emergencyContact: input.emergencyContact,
    attachments: input.attachments,
    totalDays,
  };
};

/** Past dates are admin-only (policy) and a minimum advance notice applies to planned leave. */
const assertTiming = (
  data: BuiltRequest,
  actor: LeaveActor,
  policy: PolicyForDays,
) => {
  const today = todayInBusinessTz();
  const isPast = data.startDate.getTime() < today.getTime();

  if (isPast) {
    if (policy.allowPastDateRequestsAdminOnly && !isAdminRole(actor.role)) {
      throw new AppError(400, "Past dates can only be added by an admin");
    }
    return;
  }

  if (!LEAVE_TYPE_RULES[data.leaveType].noticeExempt) {
    const noticeDays = diffInDays(today, data.startDate);
    if (noticeDays < policy.minAdvanceNoticeDays) {
      throw new AppError(
        400,
        `Please apply at least ${policy.minAdvanceNoticeDays} day(s) in advance`,
      );
    }
  }
};

/**
 * Rejects a request that overlaps the staff member's pending/approved leave.
 * Record-only types are not checked. Two half days on the same date are fine
 * when they are for different sessions.
 */
const assertNoOverlap = async (
  staffId: string,
  data: Pick<BuiltRequest, "leaveType" | "startDate" | "endDate" | "halfDaySession">,
  excludeId?: string,
  session?: ClientSession,
) => {
  if (!LEAVE_TYPE_RULES[data.leaveType].countsDays) return;

  const filter: QueryFilter<ILeaveRequest> = {
    staff: staffId,
    status: { $in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
    leaveType: { $in: DAY_CONSUMING_TYPES },
    startDate: { $lte: data.endDate },
    endDate: { $gte: data.startDate },
  };
  if (excludeId) filter._id = { $ne: excludeId };

  const clashes = await LeaveRequest.find(filter).session(session ?? null);
  const blocking = clashes.find((c) => {
    const bothHalf = c.leaveType === LeaveType.HALF_DAY && data.leaveType === LeaveType.HALF_DAY;
    return !(bothHalf && c.halfDaySession !== data.halfDaySession);
  });

  if (blocking) {
    throw new AppError(
      409,
      "This overlaps with an existing pending or approved leave request for the same dates",
    );
  }
};

const assertActiveStaff = async (staffId: string, session?: ClientSession) => {
  const user = await User.findOne({
    _id: staffId,
    isDeleted: false,
    status: UserStatus.ACTIVE,
  })
    .select("_id role")
    .session(session ?? null);
  if (!user) throw new AppError(404, "Staff member not found or inactive");
  return user;
};

/* -------------------------------------------------------------------------- */
/* Decision core (shared by approve and create-for-staff) */
/* -------------------------------------------------------------------------- */

interface ApproveOptions {
  note?: string;
  extraLeaveType?: ExtraLeaveType;
  extraApprovalNote?: string;
}

/**
 * Approves a pending request inside the caller's transaction.
 * The paid/extra split is recalculated against the balance as it is right now, because
 * other requests may have been approved since this one was submitted.
 */
const approveInSession = async (
  requestId: string,
  actor: LeaveActor,
  options: ApproveOptions,
  session: ClientSession,
) => {
  const request = await LeaveRequest.findById(requestId).session(session);
  if (!request) throw new AppError(404, "Leave request not found");
  if (request.status !== LeaveStatus.PENDING) {
    throw new AppError(400, `Only pending requests can be approved (this one is ${request.status})`);
  }

  const requester = await User.findById(request.staff).select("role").session(session);
  if (!requester) throw new AppError(404, "Staff member not found");

  assertCanDecide(actor, request.staff.toString(), requester.role);

  const year = request.startDate.getUTCFullYear();
  const balance = await LeaveBalanceService.getOrCreateBalance(request.staff, year, session);
  const { paidDays, extraDays } = splitDays(request.leaveType, request.totalDays, remainingOf(balance));

  if (extraDays > 0) {
    // Over-balance: admin / super admin only, and a decision plus comment are mandatory.
    if (!isAdminRole(actor.role)) {
      throw new AppError(403, "This request is over balance. Only an admin can approve it");
    }
    if (!options.extraLeaveType || !options.extraApprovalNote) {
      throw new AppError(
        400,
        `This request has ${extraDays} extra day(s). Choose an extra leave type (unpaid, advance or waived) and write a comment`,
      );
    }
    request.extraLeaveType = options.extraLeaveType;
    request.extraApprovedBy = new Types.ObjectId(actor.userId);
    request.extraApprovalNote = options.extraApprovalNote;
  } else {
    request.extraLeaveType = undefined;
    request.extraApprovedBy = undefined;
    request.extraApprovalNote = undefined;
  }

  request.paidDays = paidDays;
  request.extraDays = extraDays;
  request.status = LeaveStatus.APPROVED;
  request.decidedBy = new Types.ObjectId(actor.userId);
  request.decidedAt = new Date();
  request.decisionNote = options.note;
  request.rejectReason = undefined;
  request.timeline.push(
    timelineEntry(TimelineAction.APPROVED, actor.userId, options.note),
  );

  await LeaveBalanceService.applyApproval(request, actor.userId, session);
  await request.save({ session });

  if (extraDays > 0) {
    await LeaveAuditLog.create(
      [
        {
          action: LeaveAuditAction.EXTRA_LEAVE_DECISION,
          performedBy: actor.userId,
          targetStaff: request.staff,
          targetRequest: request._id,
          after: {
            extraDays,
            extraLeaveType: request.extraLeaveType,
          },
          note: request.extraApprovalNote,
        },
      ],
      { session },
    );
  }

  return request;
};

const runInTransaction = async <T>(work: (session: ClientSession) => Promise<T>): Promise<T> => {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const loadDetail = (id: string) => LeaveRequest.findById(id).populate(detailPopulate);

/** Flattens a populated request for the notifier. */
const toInfo = (request: NonNullable<Awaited<ReturnType<typeof loadDetail>>>) => {
  const staff = request.staff as unknown as {
    _id: Types.ObjectId;
    firstName?: string;
    lastName?: string;
    role?: string;
  };
  return {
    id: request._id.toString(),
    staffId: staff._id.toString(),
    staffName: `${staff.firstName ?? ""} ${staff.lastName ?? ""}`.trim() || "A team member",
    staffRole: staff.role ?? "",
    leaveType: request.leaveType,
    startDate: request.startDate,
    endDate: request.endDate,
    totalDays: request.totalDays,
    extraDays: request.extraDays,
  };
};

const nameOf = async (userId: string) => {
  const user = await User.findById(userId).select("firstName lastName");
  return `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || "A manager";
};

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

/** Admins and super admins do not request leave. An admin records theirs via another admin if needed. */
const assertCanRequestLeave = (actor: LeaveActor) => {
  if (isAdminRole(actor.role)) {
    throw new AppError(403, "Admins do not need to request leave");
  }
};

/** Dry run used by the form: day count and over-balance warning, nothing saved. */
const previewRequest = async (actor: LeaveActor, input: RequestInput) => {
  assertCanRequestLeave(actor);
  const policy = await LeavePolicyService.getPolicy();
  const data = buildRequestData(input, policy);
  const year = data.startDate.getUTCFullYear();
  const split = await LeaveBalanceService.previewSplit(actor.userId, data.leaveType, year, data.totalDays);
  return {
    totalDays: data.totalDays,
    paidDays: split.paidDays,
    extraDays: split.extraDays,
    remaining: split.remaining,
    warning:
      split.extraDays > 0
        ? `Your balance is ${Math.max(split.remaining, 0)} day(s), you are requesting ${data.totalDays}. ${split.extraDays} day(s) will count as extra leave.`
        : null,
  };
};

const createRequest = async (actor: LeaveActor, input: RequestInput) => {
  assertCanRequestLeave(actor);
  const policy = await LeavePolicyService.getPolicy();
  await assertActiveStaff(actor.userId);

  const data = buildRequestData(input, policy);
  assertTiming(data, actor, policy);
  await assertNoOverlap(actor.userId, data);

  const year = data.startDate.getUTCFullYear();
  const split = await LeaveBalanceService.previewSplit(actor.userId, data.leaveType, year, data.totalDays);

  const created = await LeaveRequest.create({
    staff: actor.userId,
    ...data,
    attachments: data.attachments ?? [],
    paidDays: split.paidDays,
    extraDays: split.extraDays,
    status: LeaveStatus.PENDING,
    createdBy: actor.userId,
    timeline: [timelineEntry(TimelineAction.SUBMITTED, actor.userId)],
  });

  const detail = await loadDetail(created._id.toString());
  if (detail) await LeaveNotify.submitted(toInfo(detail));
  return detail;
};

const createForStaff = async (
  actor: LeaveActor,
  input: RequestInput & {
    staffId: string;
    autoApprove: boolean;
    extraLeaveType?: ExtraLeaveType;
    extraApprovalNote?: string;
  },
) => {
  if (!isAdminRole(actor.role)) throw new AppError(403, "Only an admin can add leave for staff");
  if (input.staffId === actor.userId) {
    throw new AppError(400, "Use the normal request form for your own leave");
  }

  const policy = await LeavePolicyService.getPolicy();
  await assertActiveStaff(input.staffId);

  const data = buildRequestData(input, policy);
  assertTiming(data, actor, policy); // admins may use past dates
  await assertNoOverlap(input.staffId, data);

  const year = data.startDate.getUTCFullYear();
  const split = await LeaveBalanceService.previewSplit(input.staffId, data.leaveType, year, data.totalDays);

  const created = await LeaveRequest.create({
    staff: input.staffId,
    ...data,
    attachments: data.attachments ?? [],
    paidDays: split.paidDays,
    extraDays: split.extraDays,
    status: LeaveStatus.PENDING,
    createdBy: actor.userId,
    timeline: [timelineEntry(TimelineAction.CREATED_ON_BEHALF, actor.userId)],
  });

  await LeaveAuditLog.create({
    action: LeaveAuditAction.CREATED_ON_BEHALF,
    performedBy: actor.userId,
    targetStaff: input.staffId,
    targetRequest: created._id,
    after: { leaveType: data.leaveType, startDate: data.startDate, endDate: data.endDate },
  });

  if (input.autoApprove) {
    try {
      await runInTransaction((session) =>
        approveInSession(
          created._id.toString(),
          actor,
          {
            extraLeaveType: input.extraLeaveType,
            extraApprovalNote: input.extraApprovalNote,
          },
          session,
        ),
      );
    } catch (error) {
      // Do not leave a half-created request behind when the approval is refused.
      await LeaveRequest.deleteOne({ _id: created._id });
      throw error;
    }
  }

  const detail = await loadDetail(created._id.toString());
  if (detail) {
    await (input.autoApprove ? LeaveNotify.decided(toInfo(detail), true) : LeaveNotify.submitted(toInfo(detail)));
  }
  return detail;
};

/* -------------------------------------------------------------------------- */
/* Decisions                                                                  */
/* -------------------------------------------------------------------------- */

const approveRequest = async (id: string, actor: LeaveActor, options: ApproveOptions) => {
  await runInTransaction((session) => approveInSession(id, actor, options, session));
  const updated = await loadDetail(id);
  if (updated) await LeaveNotify.decided(toInfo(updated), true);
  return updated;
};

const rejectRequest = async (
  id: string,
  actor: LeaveActor,
  payload: { reason: string; note?: string },
) => {
  await runInTransaction(async (session) => {
    const request = await LeaveRequest.findById(id).session(session);
    if (!request) throw new AppError(404, "Leave request not found");
    if (request.status !== LeaveStatus.PENDING) {
      throw new AppError(400, `Only pending requests can be rejected (this one is ${request.status})`);
    }

    const requester = await User.findById(request.staff).select("role").session(session);
    if (!requester) throw new AppError(404, "Staff member not found");
    assertCanDecide(actor, request.staff.toString(), requester.role);

    // Managers cannot decide over-balance requests, rejection included.
    if (!isAdminRole(actor.role)) {
      const balance = await LeaveBalanceService.getOrCreateBalance(
        request.staff,
        request.startDate.getUTCFullYear(),
        session,
      );
      const { extraDays } = splitDays(request.leaveType, request.totalDays, remainingOf(balance));
      if (extraDays > 0) {
        throw new AppError(403, "This request is over balance. Only an admin can reject it");
      }
    }

    request.status = LeaveStatus.REJECTED;
    request.rejectReason = payload.reason;
    request.decisionNote = payload.note;
    request.decidedBy = new Types.ObjectId(actor.userId);
    request.decidedAt = new Date();
    request.timeline.push(timelineEntry(TimelineAction.REJECTED, actor.userId, payload.reason));
    await request.save({ session });
  });

  const updated = await loadDetail(id);
  if (updated) await LeaveNotify.decided(toInfo(updated), false, payload.reason);
  return updated;
};

const cancelRequest = async (id: string, actor: LeaveActor) => {
  const request = await LeaveRequest.findById(id);
  if (!request) throw new AppError(404, "Leave request not found");
  if (request.staff.toString() !== actor.userId) {
    throw new AppError(403, "You can only cancel your own requests");
  }
  if (request.status !== LeaveStatus.PENDING) {
    throw new AppError(400, "Only pending requests can be cancelled");
  }

  request.status = LeaveStatus.CANCELLED;
  request.timeline.push(timelineEntry(TimelineAction.CANCELLED, actor.userId));
  await request.save();
  return LeaveRequest.findById(id).populate(detailPopulate);
};

const recommendRequest = async (id: string, actor: LeaveActor, note: string) => {
  if (actor.role !== Role.MANAGER) {
    throw new AppError(403, "Only managers add recommendations");
  }
  const request = await LeaveRequest.findById(id);
  if (!request) throw new AppError(404, "Leave request not found");
  if (request.staff.toString() === actor.userId) {
    throw new AppError(403, "You cannot recommend on your own request");
  }
  if (request.status !== LeaveStatus.PENDING) {
    throw new AppError(400, "Recommendations can only be added to pending requests");
  }

  const balance = await LeaveBalanceService.getOrCreateBalance(
    request.staff,
    request.startDate.getUTCFullYear(),
  );
  const { extraDays } = splitDays(request.leaveType, request.totalDays, remainingOf(balance));
  if (extraDays === 0) {
    throw new AppError(400, "Recommendations are only for over-balance requests. You can approve this one directly");
  }

  request.recommendations.push({ by: new Types.ObjectId(actor.userId), note, at: new Date() });
  request.timeline.push(timelineEntry(TimelineAction.RECOMMENDED, actor.userId, note));
  await request.save();
  const updated = await loadDetail(id);
  if (updated) await LeaveNotify.recommended(toInfo(updated), await nameOf(actor.userId));
  return updated;
};

/* -------------------------------------------------------------------------- */
/* Edit (admin / manager)                                                     */
/* -------------------------------------------------------------------------- */

const updateRequest = async (
  id: string,
  actor: LeaveActor,
  payload: Partial<RequestInput> & {
    extraLeaveType?: ExtraLeaveType;
    extraApprovalNote?: string;
    note?: string;
  },
) => {
  if (!isApprover(actor.role)) throw new AppError(403, "You are not allowed to edit requests");

  await runInTransaction(async (session) => {
    const request = await LeaveRequest.findById(id).session(session);
    if (!request) throw new AppError(404, "Leave request not found");
    if (![LeaveStatus.PENDING, LeaveStatus.APPROVED].includes(request.status)) {
      throw new AppError(400, `A ${request.status} request cannot be edited`);
    }
    if (request.staff.toString() === actor.userId) {
      throw new AppError(403, "You cannot edit your own request");
    }

    const requester = await User.findById(request.staff).select("role").session(session);
    if (!requester) throw new AppError(404, "Staff member not found");
    // Managers only handle staff requests; admins handle everyone's.
    if (!isAdminRole(actor.role) && isApprover(requester.role)) {
      throw new AppError(403, "Only an admin can edit a manager's or admin's request");
    }

    const policy = await LeavePolicyService.getPolicy(session);
    const before = request.toObject();

    const merged = buildRequestData(
      {
        leaveType: payload.leaveType ?? request.leaveType,
        startDate: (payload.startDate ?? request.startDate.toISOString()).slice(0, 10),
        endDate: (payload.endDate ?? request.endDate.toISOString()).slice(0, 10),
        halfDaySession: payload.halfDaySession ?? request.halfDaySession,
        leaveTime: payload.leaveTime ?? request.leaveTime,
        expectedArrivalTime: payload.expectedArrivalTime ?? request.expectedArrivalTime,
        reason: payload.reason ?? request.reason,
        emergencyContact: payload.emergencyContact ?? request.emergencyContact,
        attachments: payload.attachments ?? request.attachments,
      },
      policy,
    );
    await assertNoOverlap(request.staff.toString(), merged, id, session);

    const wasApproved = request.status === LeaveStatus.APPROVED;
    if (wasApproved) {
      // Take the old effect off the balance first, then re-split against the freed balance.
      await LeaveBalanceService.reverseApproval(request, actor.userId, session);
    }

    const balance = await LeaveBalanceService.getOrCreateBalance(
      request.staff,
      merged.startDate.getUTCFullYear(),
      session,
    );
    const { paidDays, extraDays } = splitDays(merged.leaveType, merged.totalDays, remainingOf(balance));

    if (wasApproved && extraDays > 0) {
      if (!isAdminRole(actor.role)) {
        throw new AppError(403, "This edit makes the request over balance. Only an admin can do that");
      }
      const extraLeaveType = payload.extraLeaveType ?? request.extraLeaveType;
      const extraApprovalNote = payload.extraApprovalNote ?? request.extraApprovalNote;
      if (!extraLeaveType || !extraApprovalNote) {
        throw new AppError(
          400,
          `This edit leaves ${extraDays} extra day(s). Choose an extra leave type and write a comment`,
        );
      }
      request.extraLeaveType = extraLeaveType;
      request.extraApprovalNote = extraApprovalNote;
      request.extraApprovedBy = new Types.ObjectId(actor.userId);
    } else if (wasApproved) {
      request.extraLeaveType = undefined;
      request.extraApprovedBy = undefined;
      request.extraApprovalNote = undefined;
    }

    request.set({
      leaveType: merged.leaveType,
      startDate: merged.startDate,
      endDate: merged.endDate,
      halfDaySession: merged.halfDaySession,
      leaveTime: merged.leaveTime,
      expectedArrivalTime: merged.expectedArrivalTime,
      reason: merged.reason,
      emergencyContact: merged.emergencyContact,
      attachments: merged.attachments ?? [],
      totalDays: merged.totalDays,
      paidDays,
      extraDays,
    });
    request.timeline.push(timelineEntry(TimelineAction.EDITED, actor.userId, payload.note));

    if (wasApproved) {
      await LeaveBalanceService.applyApproval(request, actor.userId, session);
    }
    await request.save({ session });

    await LeaveAuditLog.create(
      [
        {
          action: LeaveAuditAction.REQUEST_EDITED,
          performedBy: actor.userId,
          targetStaff: request.staff,
          targetRequest: request._id,
          before,
          after: request.toObject(),
          note: payload.note,
        },
      ],
      { session },
    );
  });

  const updated = await loadDetail(id);
  if (updated) await LeaveNotify.edited(toInfo(updated));
  return updated;
};

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

interface ListQuery {
  page?: number;
  limit?: number;
  status?: LeaveStatus;
  leaveType?: LeaveType;
  staff?: string;
  from?: string;
  to?: string;
  extraOnly?: "true" | "false";
  mine?: "true" | "false";
  sort?: "createdAt" | "-createdAt" | "startDate" | "-startDate";
}

const listRequests = async (query: ListQuery, actor: LeaveActor) => {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;

  const filter: QueryFilter<ILeaveRequest> = {};
  // Staff only ever see their own requests, whatever the query says.
  if (!isApprover(actor.role) || query.mine === "true") filter.staff = actor.userId;
  else if (query.mine === "false") filter.staff = { $ne: actor.userId };
  else if (query.staff) filter.staff = query.staff;

  if (query.status) filter.status = query.status;
  if (query.leaveType) filter.leaveType = query.leaveType;
  if (query.extraOnly === "true") filter.extraDays = { $gt: 0 };
  if (query.from) filter.endDate = { $gte: parseDay(query.from) };
  if (query.to) filter.startDate = { $lte: parseDay(query.to) };

  const [result, total] = await Promise.all([
    LeaveRequest.find(filter)
      .populate(staffPopulate)
      .populate({ path: "decidedBy", select: "firstName lastName fullName" })
      .sort(query.sort ?? "-createdAt")
      .skip((page - 1) * limit)
      .limit(limit),
    LeaveRequest.countDocuments(filter),
  ]);

  return { result, meta: { page, limit, total, totalPage: Math.ceil(total / limit) } };
};

const getRequest = async (id: string, actor: LeaveActor) => {
  const request = await LeaveRequest.findById(id).populate(detailPopulate);
  if (!request) throw new AppError(404, "Leave request not found");

  const staffId = (request.staff as unknown as { _id: Types.ObjectId })._id.toString();
  if (!isApprover(actor.role) && staffId !== actor.userId) {
    throw new AppError(403, "You can only view your own requests");
  }
  return request;
};

export const LeaveService = {
  previewRequest,
  createRequest,
  createForStaff,
  approveRequest,
  rejectRequest,
  cancelRequest,
  recommendRequest,
  updateRequest,
  listRequests,
  getRequest,
};
