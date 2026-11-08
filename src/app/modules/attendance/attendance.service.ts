import { QueryFilter, Types } from "mongoose";
import { StatusCodes } from "http-status-codes";
import AppError from "../../errorHelpers/appError";
import { User } from "../user/user.model";
import { UserStatus } from "../user/user.interface";
import { AttendanceState, FUTURE_TOLERANCE_MS, MAX_SHIFT_MS } from "./attendance.constant";
import {
  AttendanceActor,
  IAttendance,
  IAttendanceBreak,
  IAttendanceView,
  ManualBreakInput,
} from "./attendance.interface";
import { Attendance } from "./attendance.model";
import {
  breakMinutes,
  currentMonth,
  isMissingCheckOut,
  monthRange,
  stateOf,
  toDhakaDate,
  workedMinutes,
} from "./attendance.utils";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

type AttendanceLean = Omit<IAttendance, "user" | "editedBy"> & {
  _id: Types.ObjectId;
  user: unknown;
  editedBy: unknown;
};

const userPopulate = {
  path: "user",
  select: "firstName lastName fullName email role designation department avatar",
};
const editorPopulate = { path: "editedBy", select: "firstName lastName fullName" };
const populateAll = [userPopulate, editorPopulate];

/** Adds the values that depend on the current time (live total, missing check-out, state). */
const present = (record: AttendanceLean, now: Date): IAttendanceView => ({
  _id: record._id.toString(),
  user: record.user,
  date: record.date,
  checkIn: record.checkIn,
  checkOut: record.checkOut ?? null,
  breaks: record.breaks.map((b) => ({ start: b.start, end: b.end ?? null })),
  // Closed days use the stored value; open days are computed live.
  totalWorkMinutes: record.checkOut ? record.totalWorkMinutes : workedMinutes(record, now),
  breakMinutes: breakMinutes(record, now),
  isMissingCheckOut: isMissingCheckOut(record, now),
  isEdited: Boolean(record.editedAt),
  state: stateOf(record),
  editedBy: record.editedBy ?? null,
  editReason: record.editReason ?? null,
  editedAt: record.editedAt ?? null,
});

/**
 * Missing check-outs are detected when records are read (no cron needed).
 * This persists the flag so the stored field stays in step with what the API reports.
 */
const syncMissingFlags = async (records: AttendanceLean[], now: Date) => {
  const ids = records
    .filter((r) => !r.isMissingCheckOut && isMissingCheckOut(r, now))
    .map((r) => r._id);
  if (ids.length) {
    await Attendance.updateMany({ _id: { $in: ids }, checkOut: null }, { $set: { isMissingCheckOut: true } });
  }
};

const presentMany = async (records: AttendanceLean[], now: Date) => {
  await syncMissingFlags(records, now);
  return records.map((r) => present(r, now));
};

const isDuplicateKey = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;

const loadView = async (id: Types.ObjectId | string, now: Date) => {
  const record = (await Attendance.findById(id).populate(populateAll).lean()) as unknown as AttendanceLean | null;
  if (!record) throw new AppError(StatusCodes.NOT_FOUND, "Attendance record not found");
  return present(record, now);
};

/* -------------------------------------------------------------------------- */
/* Staff actions                                                              */
/* -------------------------------------------------------------------------- */

const checkIn = async (actor: AttendanceActor) => {
  const now = new Date();
  const date = toDhakaDate(now);

  const existing = await Attendance.exists({ user: actor.userId, date });
  if (existing) throw new AppError(StatusCodes.CONFLICT, "You have already checked in today");

  try {
    const created = await Attendance.create({ user: actor.userId, date, checkIn: now });
    return await loadView(created._id, now);
  } catch (error) {
    // Two clicks racing past the check above hit the unique { user, date } index.
    if (isDuplicateKey(error)) {
      throw new AppError(StatusCodes.CONFLICT, "You have already checked in today");
    }
    throw error;
  }
};

/** Explains why an atomic break update matched nothing. */
const explainBreakFailure = async (
  actor: AttendanceActor,
  date: string,
  action: "break-start" | "break-end",
): Promise<never> => {
  const record = await Attendance.findOne({ user: actor.userId, date }).lean();
  if (!record) throw new AppError(StatusCodes.BAD_REQUEST, "You have not checked in today");
  if (record.checkOut) throw new AppError(StatusCodes.CONFLICT, "You have already checked out today");
  if (action === "break-start") throw new AppError(StatusCodes.CONFLICT, "A break is already running");
  throw new AppError(StatusCodes.CONFLICT, "No break is running");
};

const checkOut = async (actor: AttendanceActor) => {
  const now = new Date();
  const date = toDhakaDate(now);

  const record = await Attendance.findOne({ user: actor.userId, date }).lean();
  if (!record) throw new AppError(StatusCodes.BAD_REQUEST, "You have not checked in today");
  if (record.checkOut) throw new AppError(StatusCodes.CONFLICT, "You have already checked out today");

  // An open break is closed at the same moment as the check-out.
  const breaks: IAttendanceBreak[] = record.breaks.map((b) => ({ start: b.start, end: b.end ?? now }));
  const total = workedMinutes({ date, checkIn: record.checkIn, checkOut: now, breaks }, now);

  const updated = await Attendance.findOneAndUpdate(
    { _id: record._id, checkOut: null },
    { $set: { checkOut: now, breaks, totalWorkMinutes: total, isMissingCheckOut: false } },
    { new: true },
  );
  if (!updated) throw new AppError(StatusCodes.CONFLICT, "You have already checked out today");
  return loadView(updated._id, now);
};

const startBreak = async (actor: AttendanceActor) => {
  const now = new Date();
  const date = toDhakaDate(now);

  // Atomic: only matches an open day with no running break.
  const updated = await Attendance.findOneAndUpdate(
    {
      user: actor.userId,
      date,
      checkOut: null,
      breaks: { $not: { $elemMatch: { end: null } } },
    },
    { $push: { breaks: { start: now, end: null } } },
    { new: true },
  );
  if (!updated) return explainBreakFailure(actor, date, "break-start");
  return loadView(updated._id, now);
};

const endBreak = async (actor: AttendanceActor) => {
  const now = new Date();
  const date = toDhakaDate(now);

  const updated = await Attendance.findOneAndUpdate(
    { user: actor.userId, date, checkOut: null, breaks: { $elemMatch: { end: null } } },
    { $set: { "breaks.$[open].end": now } },
    { new: true, arrayFilters: [{ "open.end": null }] },
  );
  if (!updated) return explainBreakFailure(actor, date, "break-end");
  return loadView(updated._id, now);
};

/* -------------------------------------------------------------------------- */
/* Staff reads                                                                */
/* -------------------------------------------------------------------------- */

const getToday = async (actor: AttendanceActor) => {
  const now = new Date();
  const record = (await Attendance.findOne({ user: actor.userId, date: toDhakaDate(now) })
    .populate(populateAll)
    .lean()) as unknown as AttendanceLean | null;

  return {
    state: stateOf(record) as AttendanceState,
    // The client uses this to tick the live timer without trusting its own clock.
    serverTime: now,
    record: record ? present(record, now) : null,
  };
};

const getMyMonth = async (actor: AttendanceActor, month = currentMonth()) => {
  const now = new Date();
  const { from, to } = monthRange(month);

  const records = (await Attendance.find({ user: actor.userId, date: { $gte: from, $lte: to } })
    .populate(editorPopulate)
    .sort("-date")
    .lean()) as unknown as AttendanceLean[];

  const days = await presentMany(records, now);
  return {
    month,
    serverTime: now,
    monthlyTotalMinutes: days.reduce((sum, d) => sum + d.totalWorkMinutes, 0),
    daysPresent: days.length,
    days,
  };
};

/* -------------------------------------------------------------------------- */
/* Admin / manager reads                                                      */
/* -------------------------------------------------------------------------- */

interface ListQuery {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  userId?: string;
}

const list = async (query: ListQuery) => {
  const now = new Date();
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;

  const filter: QueryFilter<IAttendance> = {};
  if (query.userId) filter.user = new Types.ObjectId(query.userId);
  if (query.from || query.to) {
    filter.date = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }

  const [records, total] = await Promise.all([
    Attendance.find(filter)
      .populate(populateAll)
      .sort("-date -checkIn")
      .skip((page - 1) * limit)
      .limit(limit)
      .lean() as unknown as Promise<AttendanceLean[]>,
    Attendance.countDocuments(filter),
  ]);

  return {
    result: await presentMany(records, now),
    meta: { page, limit, total, totalPage: Math.ceil(total / limit) },
  };
};

const getSummary = async (month = currentMonth()) => {
  const now = new Date();
  const { from, to } = monthRange(month);

  const records = (await Attendance.find({ date: { $gte: from, $lte: to } }).lean()) as unknown as AttendanceLean[];
  await syncMissingFlags(records, now);

  const totals = new Map<string, { totalMinutes: number; daysPresent: number; missingCheckOutDays: number }>();
  for (const record of records) {
    const key = String(record.user);
    const row = totals.get(key) ?? { totalMinutes: 0, daysPresent: 0, missingCheckOutDays: 0 };
    const view = present(record, now);
    row.totalMinutes += view.totalWorkMinutes;
    row.daysPresent += 1;
    if (view.isMissingCheckOut) row.missingCheckOutDays += 1;
    totals.set(key, row);
  }

  // Active staff are listed even with zero days; former staff appear only if they have records.
  const users = await User.find({
    $or: [
      { isDeleted: { $ne: true }, status: UserStatus.ACTIVE },
      { _id: { $in: Array.from(totals.keys()) } },
    ],
  })
    .select("firstName lastName fullName email role designation department avatar")
    .lean();

  const staff = users
    .map((user) => ({
      user,
      ...(totals.get(String(user._id)) ?? { totalMinutes: 0, daysPresent: 0, missingCheckOutDays: 0 }),
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  return { month, staff };
};

/* -------------------------------------------------------------------------- */
/* Manual create / edit (admin, manager)                                      */
/* -------------------------------------------------------------------------- */

interface ManualTimes {
  checkIn: Date;
  checkOut: Date | null;
  breaks: ManualBreakInput[];
}

/** Validates the times and returns the breaks normalised (sorted, open break closed at check-out). */
const normaliseManualTimes = (times: ManualTimes, now: Date): IAttendanceBreak[] => {
  const bad = (message: string) => new AppError(StatusCodes.BAD_REQUEST, message);
  const limit = now.getTime() + FUTURE_TOLERANCE_MS;
  const { checkIn: inAt, checkOut: outAt } = times;

  if (inAt.getTime() > limit) throw bad("Check-in cannot be in the future");
  if (outAt) {
    if (outAt.getTime() > limit) throw bad("Check-out cannot be in the future");
    if (outAt.getTime() <= inAt.getTime()) throw bad("Check-out must be after check-in");
    if (outAt.getTime() - inAt.getTime() > MAX_SHIFT_MS) throw bad("A record cannot be longer than 24 hours");
  }

  const breaks: IAttendanceBreak[] = times.breaks
    .map((b) => ({ start: b.start, end: b.end ?? outAt ?? null }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  breaks.forEach((b, index) => {
    if (b.start.getTime() < inAt.getTime()) throw bad("A break cannot start before check-in");
    if (b.start.getTime() > limit) throw bad("A break cannot be in the future");
    if (outAt && b.start.getTime() >= outAt.getTime()) throw bad("A break cannot start after check-out");
    if (b.end) {
      if (b.end.getTime() <= b.start.getTime()) throw bad("A break must end after it starts");
      if (outAt && b.end.getTime() > outAt.getTime()) throw bad("A break cannot end after check-out");
    } else if (index !== breaks.length - 1) {
      throw bad("Only the last break can be left open");
    }
    const previous = breaks[index - 1];
    if (previous?.end && previous.end.getTime() > b.start.getTime()) {
      throw bad("Breaks cannot overlap");
    }
  });

  return breaks;
};

interface UpdateInput {
  checkIn?: Date;
  checkOut?: Date | null;
  breaks?: ManualBreakInput[];
  editReason: string;
}

const update = async (id: string, input: UpdateInput, actor: AttendanceActor) => {
  const now = new Date();
  const record = await Attendance.findById(id).lean();
  if (!record) throw new AppError(StatusCodes.NOT_FOUND, "Attendance record not found");

  const times: ManualTimes = {
    checkIn: input.checkIn ?? record.checkIn,
    checkOut: input.checkOut === undefined ? (record.checkOut ?? null) : input.checkOut,
    breaks: input.breaks ?? record.breaks,
  };

  // The day is part of the record's identity, so the check-in must stay on it.
  if (toDhakaDate(times.checkIn) !== record.date) {
    throw new AppError(StatusCodes.BAD_REQUEST, `Check-in must be on ${record.date}`);
  }

  const breaks = normaliseManualTimes(times, now);
  const closed = { date: record.date, checkIn: times.checkIn, checkOut: times.checkOut, breaks };

  await Attendance.updateOne(
    { _id: record._id },
    {
      $set: {
        checkIn: times.checkIn,
        checkOut: times.checkOut,
        breaks,
        totalWorkMinutes: times.checkOut ? workedMinutes(closed, now) : 0,
        isMissingCheckOut: isMissingCheckOut(closed, now),
        editedBy: new Types.ObjectId(actor.userId),
        editReason: input.editReason,
        editedAt: now,
      },
    },
  );
  return loadView(record._id, now);
};

interface CreateInput {
  userId: string;
  date: string;
  checkIn: Date;
  checkOut?: Date | null;
  breaks: ManualBreakInput[];
  editReason: string;
}

const create = async (input: CreateInput, actor: AttendanceActor) => {
  const now = new Date();

  const staff = await User.exists({ _id: input.userId, isDeleted: { $ne: true } });
  if (!staff) throw new AppError(StatusCodes.NOT_FOUND, "Staff member not found");

  if (toDhakaDate(input.checkIn) !== input.date) {
    throw new AppError(StatusCodes.BAD_REQUEST, `Check-in must be on ${input.date}`);
  }

  const checkOutAt = input.checkOut ?? null;
  const breaks = normaliseManualTimes({ checkIn: input.checkIn, checkOut: checkOutAt, breaks: input.breaks }, now);
  const closed = { date: input.date, checkIn: input.checkIn, checkOut: checkOutAt, breaks };

  try {
    const created = await Attendance.create({
      user: input.userId,
      date: input.date,
      checkIn: input.checkIn,
      checkOut: checkOutAt,
      breaks,
      totalWorkMinutes: checkOutAt ? workedMinutes(closed, now) : 0,
      isMissingCheckOut: isMissingCheckOut(closed, now),
      editedBy: actor.userId,
      editReason: input.editReason,
      editedAt: now,
    });
    return await loadView(created._id, now);
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new AppError(StatusCodes.CONFLICT, "A record already exists for this staff member and date");
    }
    throw error;
  }
};

export const AttendanceService = {
  checkIn,
  checkOut,
  startBreak,
  endBreak,
  getToday,
  getMyMonth,
  list,
  getSummary,
  update,
  create,
};
