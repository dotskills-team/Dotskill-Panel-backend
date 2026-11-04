import { Schema, model } from "mongoose";
import { IReminderNotification } from "./domain-hosting.interface";
import { TargetType } from "./domain-hosting.constant";

/**
 * In-app reminder created by the daily job.
 * The unique index makes the job idempotent: running it twice on the same day
 * never creates a duplicate reminder for the same expiry and threshold.
 */
const reminderNotificationSchema = new Schema<IReminderNotification>(
  {
    targetType: {
      type: String,
      enum: Object.values(TargetType),
      required: true,
    },
    targetId: { type: Schema.Types.ObjectId, required: true },
    subjectName: { type: String, default: "" },
    clientName: { type: String, default: "" },
    expiryDate: { type: Date, required: true },
    daysBefore: { type: Number, required: true, min: 0 },
    title: { type: String, required: true },
    message: { type: String, required: true },
    audience: { type: [String], default: [] },
    readBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

reminderNotificationSchema.index(
  { targetType: 1, targetId: 1, expiryDate: 1, daysBefore: 1 },
  { unique: true },
);
reminderNotificationSchema.index({ audience: 1, createdAt: -1 });

export const ReminderNotification = model<IReminderNotification>(
  "ReminderNotification",
  reminderNotificationSchema,
);
