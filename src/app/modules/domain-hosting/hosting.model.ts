import { Schema, model } from "mongoose";
import { IHosting, IHostingCredential } from "./domain-hosting.interface";
import {
  BillingCycle,
  DEFAULT_CURRENCY,
  HostingType,
  PaidBy,
  RenewalStatus,
} from "./domain-hosting.constant";
import { encryptedSecretSchema } from "./encrypted-secret.schema";

/** One login row on a hosting account (cPanel, SSH, FTP, DB, provider account...). */
const hostingCredentialSchema = new Schema<IHostingCredential>(
  {
    label: { type: String, required: [true, "Credential label is required"], trim: true },
    loginUrl: { type: String, trim: true, default: "" },
    username: { type: String, trim: true, default: "" },
    passwordEncrypted: { type: encryptedSecretSchema, default: null },
    port: { type: Number, min: 1, max: 65535, default: null },
    note: { type: String, trim: true, default: "" },
  },
  { _id: true },
);

const hostingSchema = new Schema<IHosting>(
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

    linkedDomains: [{ type: Schema.Types.ObjectId, ref: "Domain" }],

    hostingType: {
      type: String,
      enum: Object.values(HostingType),
      default: HostingType.SHARED,
    },
    provider: { type: String, trim: true, default: "" },
    planName: { type: String, trim: true, default: "" },
    serverLocation: { type: String, trim: true, default: "" },
    serverIp: { type: String, trim: true, default: "" },

    controlPanel: { type: String, trim: true, default: "" },
    controlPanelUrl: { type: String, trim: true, default: "" },

    purchaseDate: { type: Date, default: null },
    expiryDate: {
      type: Date,
      required: [true, "Expiry date is required"],
      index: true,
    },
    billingCycle: {
      type: String,
      enum: Object.values(BillingCycle),
      default: BillingCycle.YEARLY,
    },

    purchasePrice: { type: Number, min: 0, default: 0 },
    renewalPrice: { type: Number, min: 0, default: 0 },
    currency: { type: String, trim: true, uppercase: true, default: DEFAULT_CURRENCY },
    paidBy: {
      type: String,
      enum: Object.values(PaidBy),
      default: PaidBy.COMPANY,
    },

    credentials: { type: [hostingCredentialSchema], default: [] },

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

hostingSchema.index({ status: 1, expiryDate: 1 });

export const Hosting = model<IHosting>("Hosting", hostingSchema);
