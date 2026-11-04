/* eslint-disable @typescript-eslint/no-explicit-any */
import { addDays, endOfDay, startOfDay } from "date-fns";
import { Model } from "mongoose";

import {
  EXPIRING_SOON_DAYS,
  NOTIFICATION_ROLES,
  REMINDER_DAYS,
  RenewalStatus,
  TargetType,
} from "./domain-hosting.constant";
import { Domain } from "./domain.model";
import { Hosting } from "./hosting.model";
import { ReminderNotification } from "./reminder-notification.model";
import { getDaysLeft } from "./domain-hosting.utils";
import { deriveStatus } from "./domain-hosting.service";

export interface ReminderJobResult {
  statusesUpdated: number;
  notificationsCreated: number;
}

/** Display name for a reminder: the domain name, or provider and plan for hosting. */
const subjectNameOf = (type: TargetType, doc: any): string => {
  if (type === TargetType.DOMAIN) return doc.domainName;

  const provider = doc.provider || "Hosting";
  return doc.planName ? `${provider} – ${doc.planName}` : provider;
};

const buildReminderText = (subjectName: string, clientName: string, daysBefore: number) => {
  const who = clientName ? ` for ${clientName}` : "";

  if (daysBefore === 0) {
    return {
      title: "Expires today",
      message: `${subjectName}${who} expires today. Contact the client to renew.`,
    };
  }

  const unit = daysBefore === 1 ? "day" : "days";
  return {
    title: `Expires in ${daysBefore} ${unit}`,
    message: `${subjectName}${who} expires in ${daysBefore} ${unit}. Contact the client to renew.`,
  };
};

/**
 * Daily job:
 *  1. Recalculates each live record's status from its expiry date.
 *  2. Creates an in-app reminder for every record whose days-left matches a configured
 *     threshold (default 30, 15, 7, 3, 1 and 0).
 *
 * Safe to run more than once a day: the unique index on ReminderNotification means
 * a reminder is never duplicated for the same expiry date and threshold.
 */
export const runDomainHostingDailyJob = async (now: Date = new Date()): Promise<ReminderJobResult> => {
  const today = startOfDay(now);

  // Look ahead far enough to cover the largest reminder threshold and the 30-day status window
  const largestThreshold = Math.max(...REMINDER_DAYS, EXPIRING_SOON_DAYS);
  const horizon = endOfDay(addDays(today, largestThreshold));

  let statusesUpdated = 0;
  let notificationsCreated = 0;

  const targets: Array<[TargetType, Model<any>]> = [
    [TargetType.DOMAIN, Domain],
    [TargetType.HOSTING, Hosting],
  ];

  for (const [type, Target] of targets) {
    const docs = await Target.find({
      isDeleted: false,
      status: { $ne: RenewalStatus.CANCELLED },
      expiryDate: { $lte: horizon },
    })
      .select("status expiryDate clientName domainName provider planName")
      .lean();

    const statusOps: any[] = [];
    const reminderOps: any[] = [];

    for (const doc of docs as any[]) {
      const nextStatus = deriveStatus(doc.status, doc.expiryDate, now);

      if (nextStatus !== doc.status) {
        statusOps.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { status: nextStatus } },
          },
        });
      }

      const daysBefore = getDaysLeft(doc.expiryDate, now);

      if (REMINDER_DAYS.includes(daysBefore)) {
        const subjectName = subjectNameOf(type, doc);
        const clientName = doc.clientName ?? "";
        const { title, message } = buildReminderText(subjectName, clientName, daysBefore);

        reminderOps.push({
          updateOne: {
            filter: {
              targetType: type,
              targetId: doc._id,
              expiryDate: doc.expiryDate,
              daysBefore,
            },
            update: {
              $setOnInsert: {
                targetType: type,
                targetId: doc._id,
                subjectName,
                clientName,
                expiryDate: doc.expiryDate,
                daysBefore,
                title,
                message,
                audience: NOTIFICATION_ROLES,
                readBy: [],
              },
            },
            upsert: true,
          },
        });
      }
    }

    if (statusOps.length > 0) {
      const result = await Target.bulkWrite(statusOps, { ordered: false });
      statusesUpdated += result.modifiedCount ?? 0;
    }

    if (reminderOps.length > 0) {
      const result = await ReminderNotification.bulkWrite(reminderOps, { ordered: false });
      notificationsCreated += result.upsertedCount ?? 0;
    }
  }

  return { statusesUpdated, notificationsCreated };
};
