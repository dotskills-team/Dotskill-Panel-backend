/* eslint-disable no-console */
import { schedule, type ScheduledTask } from "node-cron";

import { envVars } from "../../config/env";
import { runDomainHostingDailyJob } from "./domain-hosting.reminder.service";

const DEFAULT_SCHEDULE = "0 9 * * *"; // every day at 09:00
const DEFAULT_TIMEZONE = "Asia/Dhaka";

/**
 * Starts the daily renewal job. Call once after the database connects.
 * Schedule and timezone come from DOMAIN_CRON_SCHEDULE and DOMAIN_CRON_TIMEZONE.
 *
 * Note: an in-process cron only runs on a long-lived server. On serverless hosting
 * (e.g. Vercel) call the job through the protected endpoint
 * POST /api/v1/domain-hosting/run-reminders from an external scheduler instead.
 */
export const startDomainHostingCron = (): ScheduledTask => {
  const expression = envVars.DOMAIN_CRON_SCHEDULE ?? DEFAULT_SCHEDULE;
  const timezone = envVars.DOMAIN_CRON_TIMEZONE ?? DEFAULT_TIMEZONE;

  return schedule(
    expression,
    async () => {
      try {
        const result = await runDomainHostingDailyJob();
        console.log(
          `[domain-hosting cron] statuses updated: ${result.statusesUpdated}, reminders created: ${result.notificationsCreated}`,
        );
      } catch (error) {
        console.error("[domain-hosting cron] daily job failed:", error);
      }
    },
    { timezone, name: "domain-hosting-daily" },
  );
};
