import { model, Schema, Types } from "mongoose";

export interface INotification {
  _id?: Types.ObjectId;
  recipient: Types.ObjectId;
  /** Module-scoped type, e.g. "leave.submitted". Lets the UI pick an icon later. */
  type: string;
  title: string;
  message: string;
  /** In-app route to open when the notification is clicked. */
  link?: string;
  readAt?: Date | null;
  /** Makes a notification idempotent per recipient (used by cron reminders). */
  dedupeKey?: string;
  createdAt?: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    link: { type: String, trim: true },
    readAt: { type: Date, default: null },
    dedupeKey: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });
// One notification per recipient and dedupeKey; notifications without a key are unrestricted.
notificationSchema.index(
  { recipient: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } },
);

export const Notification = model<INotification>("Notification", notificationSchema);
