import { Schema, model } from "mongoose";

import { ClientStatus, ClientType, IClient } from "./client.interface";

const clientSchema = new Schema<IClient>(
  {
    leadId: {
      type: Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
    },

    accountManager: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    clientType: {
      type: String,
      enum: Object.values(ClientType),
      default: ClientType.INDIVIDUAL,
    },

    firstName: {
      type: String,
      trim: true,
    },

    lastName: {
      type: String,
      trim: true,
    },

    fullName: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    alternatePhone: {
      type: String,
      trim: true,
    },

    companyName: {
      type: String,
      trim: true,
    },

    companyWebsite: {
      type: String,
      trim: true,
    },

    industry: {
      type: String,
      trim: true,
    },

    companySize: {
      type: String,
      trim: true,
    },

    taxId: {
      type: String,
      trim: true,
    },

    country: {
      type: String,
      trim: true,
    },

    state: {
      type: String,
      trim: true,
    },

    city: {
      type: String,
      trim: true,
    },

    zipCode: {
      type: String,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
    },

    preferredContactMethod: {
      type: String,
      trim: true,
    },

    estimatedValue: {
      type: Number,
      default: 0,
    },

    budget: {
      type: Number,
      default: 0,
    },

    timeline: {
      type: String,
      trim: true,
    },

    requirementTitle: {
      type: String,
      trim: true,
    },

    requirementDescription: {
      type: String,
      trim: true,
    },

    technologies: [
      {
        type: String,
        trim: true,
      },
    ],

    services: [
      {
        type: String,
        trim: true,
      },
    ],

    clientCode: {
      type: String,
      required: false,
      unique: true,
      trim: true,
    },

    status: {
      type: String,
      enum: Object.values(ClientStatus),
      default: ClientStatus.ACTIVE,
    },

    joinedAt: {
      type: Date,
      default: Date.now,
    },

    totalProjects: {
      type: Number,
      default: 0,
    },

    completedProjects: {
      type: Number,
      default: 0,
    },

    activeProjects: {
      type: Number,
      default: 0,
    },

    totalRevenue: {
      type: Number,
      default: 0,
    },

    totalInvoices: {
      type: Number,
      default: 0,
    },

    totalPaid: {
      type: Number,
      default: 0,
    },

    totalDue: {
      type: Number,
      default: 0,
    },

    lastContactAt: Date,

    nextFollowUp: Date,

    notes: [
      {
        type: Schema.Types.ObjectId,
        ref: "ClientNote",
      },
    ],

    documents: [
      {
        type: Schema.Types.ObjectId,
        ref: "ClientDocument",
      },
    ],

    tags: [String],

    labels: [String],

    customFields: {
      type: Schema.Types.Mixed,
      default: {},
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: Date,

    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

clientSchema.index(
  { leadId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      leadId: { $exists: true, $ne: null },
    },
  },
);

export const Client = model<IClient>("Client", clientSchema);
