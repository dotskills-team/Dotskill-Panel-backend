import { Schema, model } from "mongoose";
import { ICredentialAuditLog } from "./domain-hosting.interface";
import { TargetType } from "./domain-hosting.constant";

/** Append-only record of every password reveal: who, when, and which record. */
const credentialAuditLogSchema = new Schema<ICredentialAuditLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },
    role: { type: String, required: true },
    action: { type: String, enum: ["reveal"], default: "reveal" },
    targetType: {
      type: String,
      enum: Object.values(TargetType),
      required: [true, "Target type is required"],
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: [true, "Target ID is required"],
      index: true,
    },
    credentialId: { type: Schema.Types.ObjectId, default: null },
    ipAddress: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

export const CredentialAuditLog = model<ICredentialAuditLog>(
  "CredentialAuditLog",
  credentialAuditLogSchema,
);
