import { Schema, model } from "mongoose";
import { IRenewalLog } from "./domain-hosting.interface";
import { ContactMethod, RenewalAction, TargetType } from "./domain-hosting.constant";

/** Shared history for domains and hosting: renewals, client contacts and notes. */
const renewalLogSchema = new Schema<IRenewalLog>(
  {
    targetType: {
      type: String,
      enum: Object.values(TargetType),
      required: [true, "Target type is required"],
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: [true, "Target ID is required"],
    },
    action: {
      type: String,
      enum: Object.values(RenewalAction),
      required: [true, "Action is required"],
    },
    contactMethod: {
      type: String,
      enum: [...Object.values(ContactMethod), null],
      default: null,
    },
    oldExpiryDate: { type: Date, default: null },
    newExpiryDate: { type: Date, default: null },
    amountPaid: { type: Number, min: 0, default: 0 },
    note: { type: String, trim: true, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

// Timeline lookups: all logs for one target, newest first
renewalLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export const RenewalLog = model<IRenewalLog>("RenewalLog", renewalLogSchema);
