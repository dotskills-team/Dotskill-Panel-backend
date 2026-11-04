import { Schema, model } from "mongoose";
import { IDomain } from "./domain-hosting.interface";
import {
  DEFAULT_CURRENCY,
  PaidBy,
  RenewalStatus,
} from "./domain-hosting.constant";
import { encryptedSecretSchema } from "./encrypted-secret.schema";

const domainSchema = new Schema<IDomain>(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project is required"],
      index: true,
    },
    client: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      default: null,
      index: true,
    },
    clientName: { type: String, trim: true, default: "" },

    domainName: {
      type: String,
      required: [true, "Domain name is required"],
      trim: true,
      lowercase: true,
      unique: true,
    },
    registrar: { type: String, trim: true, default: "" },
    registrarUrl: { type: String, trim: true, default: "" },

    purchaseDate: { type: Date, default: null },
    expiryDate: {
      type: Date,
      required: [true, "Expiry date is required"],
      index: true,
    },

    purchasePrice: { type: Number, min: 0, default: 0 },
    renewalPrice: { type: Number, min: 0, default: 0 },
    currency: { type: String, trim: true, uppercase: true, default: DEFAULT_CURRENCY },
    paidBy: {
      type: String,
      enum: Object.values(PaidBy),
      default: PaidBy.COMPANY,
    },

    autoRenew: { type: Boolean, default: false },
    nameservers: { type: [String], default: [] },
    dnsNotes: { type: String, trim: true, default: "" },
    whoisPrivacy: { type: Boolean, default: false },

    credentials: {
      loginUrl: { type: String, trim: true, default: "" },
      username: { type: String, trim: true, default: "" },
      passwordEncrypted: { type: encryptedSecretSchema, default: null },
      twoFactorNote: { type: String, trim: true, default: "" },
    },

    status: {
      type: String,
      enum: Object.values(RenewalStatus),
      default: RenewalStatus.ACTIVE,
      index: true,
    },
    notes: { type: String, trim: true, default: "" },

    lastRenewedAt: { type: Date, default: null },
    lastPaidAmount: { type: Number, min: 0, default: 0 },

    isDeleted: { type: Boolean, default: false, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, versionKey: false },
);

// Compound index for the overview / reminder queries (status + nearest expiry)
domainSchema.index({ status: 1, expiryDate: 1 });

export const Domain = model<IDomain>("Domain", domainSchema);
