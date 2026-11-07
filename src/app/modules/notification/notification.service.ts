import { Types } from "mongoose";
import AppError from "../../errorHelpers/appError";
import { Role, UserStatus } from "../user/user.interface";
import { User } from "../user/user.model";
import { Notification } from "./notification.model";

export interface NotificationPayload {
  type: string;
  title: string;
  message: string;
  link?: string;
  /** When set, a recipient never gets the same key twice. */
  dedupeKey?: string;
}

/** Active users holding one of the roles, minus any excluded ids. */
const recipientsByRole = async (roles: string[], excludeIds: string[] = []) => {
  const users = await User.find({
    role: { $in: roles as Role[] },
    isDeleted: false,
    status: UserStatus.ACTIVE,
    _id: { $nin: excludeIds },
  }).select("_id");
  return users.map((u) => u._id.toString());
};

/** Creates one notification per recipient. Deduplicated recipients are skipped silently. */
const notify = async (recipients: string[], payload: NotificationPayload) => {
  const unique = Array.from(new Set(recipients));
  if (unique.length === 0) return 0;

  const ops = unique.map((recipient) => {
    const doc = {
      recipient: new Types.ObjectId(recipient),
      type: payload.type,
      title: payload.title,
      message: payload.message,
      link: payload.link,
      readAt: null,
      createdAt: new Date(),
    };
    return payload.dedupeKey
      ? {
          updateOne: {
            filter: { recipient: doc.recipient, dedupeKey: payload.dedupeKey },
            update: { $setOnInsert: { ...doc, dedupeKey: payload.dedupeKey } },
            upsert: true,
          },
        }
      : { insertOne: { document: doc } };
  });

  const result = await Notification.bulkWrite(ops, { ordered: false });
  return (result.upsertedCount ?? 0) + (result.insertedCount ?? 0);
};

const listForUser = async (userId: string, limit = 30) => {
  const [items, unreadCount] = await Promise.all([
    Notification.find({ recipient: userId }).sort({ createdAt: -1 }).limit(limit),
    Notification.countDocuments({ recipient: userId, readAt: null }),
  ]);
  return { items, unreadCount };
};

const markRead = async (id: string, userId: string) => {
  const result = await Notification.updateOne(
    { _id: id, recipient: userId, readAt: null },
    { $set: { readAt: new Date() } },
  );
  if (result.matchedCount === 0) {
    const exists = await Notification.exists({ _id: id, recipient: userId });
    if (!exists) throw new AppError(404, "Notification not found");
  }
};

const markAllRead = async (userId: string) => {
  await Notification.updateMany({ recipient: userId, readAt: null }, { $set: { readAt: new Date() } });
};

export const NotificationService = {
  recipientsByRole,
  notify,
  listForUser,
  markRead,
  markAllRead,
};
