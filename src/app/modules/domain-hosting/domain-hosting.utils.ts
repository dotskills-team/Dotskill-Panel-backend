import { differenceInCalendarDays } from "date-fns";

/**
 * Whole calendar days from `now` until `expiryDate`.
 * 0 = expires today, negative = already expired.
 * Calendar days are used so that time-of-day never changes the result.
 */
export const getDaysLeft = (expiryDate: Date | string, now: Date = new Date()): number =>
  differenceInCalendarDays(new Date(expiryDate), now);
