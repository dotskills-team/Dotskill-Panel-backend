import { LEAVE_TIMEZONE } from "./leave.constant";

/** Parses "YYYY-MM-DD" to a Date at UTC midnight. Leave dates are calendar days, never instants. */
export const parseDay = (value: string | Date): Date => {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export const toDayString = (date: Date): string => date.toISOString().slice(0, 10);

/** Today's calendar day in the business timezone, as UTC midnight. */
export const todayInBusinessTz = (): Date => {
  const str = new Date().toLocaleDateString("en-CA", { timeZone: LEAVE_TIMEZONE }); // YYYY-MM-DD
  return parseDay(str);
};

export const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

export const diffInDays = (from: Date, to: Date): number =>
  Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));

export interface DayCountPolicy {
  weeklyOffDays: number[];
  publicHolidays: { date: string }[];
}

/** True when the day is a weekly off day or a public holiday. */
export const isOffDay = (date: Date, policy: DayCountPolicy): boolean => {
  if (policy.weeklyOffDays.includes(date.getUTCDay())) return true;
  const key = toDayString(date);
  return policy.publicHolidays.some((h) => h.date === key);
};

/** Number of working days (inclusive range) after removing weekly off days and public holidays. */
export const countWorkingDays = (start: Date, end: Date, policy: DayCountPolicy): number => {
  let count = 0;
  for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    if (!isOffDay(d, policy)) count += 1;
  }
  return count;
};
