/* eslint-disable no-console */
import { schedule, type ScheduledTask } from "node-cron";

import { LEAVE_TIMEZONE } from "./leave.constant";
import {
  runYearlyRollover,
  sendStalePendingReminders,
  sendUpcomingLeaveReminders,
} from "./leave.jobs";

const guarded = (name: string, job: () => Promise<unknown>) => async () => {
  try {
    console.log(`[leave cron] ${name}:`, JSON.stringify(await job()));
  } catch (error) {
    console.error(`[leave cron] ${name} failed:`, error);
  }
};

/**
 * Starts the leave jobs. Call once after the database connects.
 *  - 08:00 daily: remind staff whose approved leave starts tomorrow
 *  - 09:30 daily: remind approvers about requests pending too long
 *  - 00:10 on 1 Jan: create the new year's balances and apply carry-forward
 *
 * Like the domain-hosting cron this runs in-process, so it needs a long-lived server.
 * On serverless hosting (e.g. Vercel) trigger POST /api/v1/leave/jobs/run from an
 * external scheduler instead.
 */
export const startLeaveCron = (): ScheduledTask[] => {
  const options = { timezone: LEAVE_TIMEZONE };
  return [
    schedule("0 8 * * *", guarded("upcoming-reminders", sendUpcomingLeaveReminders), {
      ...options,
      name: "leave-upcoming-reminders",
    }),
    schedule("30 9 * * *", guarded("stale-pending", sendStalePendingReminders), {
      ...options,
      name: "leave-stale-pending",
    }),
    schedule("10 0 1 1 *", guarded("yearly-rollover", () => runYearlyRollover()), {
      ...options,
      name: "leave-yearly-rollover",
    }),
  ];
};
