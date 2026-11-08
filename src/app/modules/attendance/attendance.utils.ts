import { AttendanceState, DAY_MS, DHAKA_OFFSET_MS } from "./attendance.constant";
import { IAttendanceBreak } from "./attendance.interface";

/** "YYYY-MM-DD" of an instant, in Asia/Dhaka. */
export const toDhakaDate = (instant: Date): string =>
  new Date(instant.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);

/** The instant a Dhaka calendar day starts (as UTC). */
export const dhakaDayStart = (date: string): Date => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - DHAKA_OFFSET_MS);
};

/** The instant a Dhaka calendar day ends (start of the next day). */
export const dhakaDayEnd = (date: string): Date => new Date(dhakaDayStart(date).getTime() + DAY_MS);

/** First and last day ("YYYY-MM-DD") of a "YYYY-MM" month. */
export const monthRange = (month: string): { from: string; to: string } => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
};

export const currentMonth = (now = new Date()): string => toDhakaDate(now).slice(0, 7);

interface TimedRecord {
  date: string;
  checkIn: Date;
  checkOut: Date | null;
  breaks: IAttendanceBreak[];
}

/** An open day that has already ended in Dhaka time without a check-out. */
export const isMissingCheckOut = (record: TimedRecord, now: Date): boolean =>
  !record.checkOut && now.getTime() >= dhakaDayEnd(record.date).getTime();

/** Total break time in ms. A running break counts up to `end`; breaks are clamped to checkIn..end. */
export const breakMs = (record: TimedRecord, end: Date): number => {
  const from = record.checkIn.getTime();
  const to = end.getTime();
  return record.breaks.reduce((sum, b) => {
    const start = Math.max(b.start.getTime(), from);
    const stop = Math.min((b.end ?? end).getTime(), to);
    return sum + Math.max(0, stop - start);
  }, 0);
};

/**
 * Worked minutes = (checkOut - checkIn) - completed breaks, never below 0.
 * An open day is computed live up to `now`, subtracting a running break.
 * An open day that ended without a check-out is unreliable, so it counts as 0 until corrected.
 */
export const workedMinutes = (record: TimedRecord, now: Date): number => {
  if (!record.checkOut && isMissingCheckOut(record, now)) return 0;
  const end = record.checkOut ?? now;
  const ms = end.getTime() - record.checkIn.getTime() - breakMs(record, end);
  return Math.max(0, Math.floor(ms / 60000));
};

export const breakMinutes = (record: TimedRecord, now: Date): number => {
  const end = record.checkOut ?? now;
  return Math.floor(breakMs(record, end) / 60000);
};

export const stateOf = (record: TimedRecord | null): AttendanceState => {
  if (!record) return AttendanceState.NOT_STARTED;
  if (record.checkOut) return AttendanceState.CHECKED_OUT;
  return record.breaks.some((b) => !b.end) ? AttendanceState.ON_BREAK : AttendanceState.WORKING;
};
