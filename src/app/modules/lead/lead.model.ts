import { model, Schema } from "mongoose";
import {
  AttachmentType,
  IAttachment,
  ILead,
  ILeadAttachment,
  INote,
  LeadContactStatus,
  LeadPriority,
  LeadSource,
  LeadStatus,
  PreferredContactMethod,
} from "./lead.interface";

const leadAttachmentSchema = new Schema<ILeadAttachment>(
  {
    title: { type: String, required: false },
    url: { type: String, required: false },
    type: {
      type: String,
      enum: Object.values(AttachmentType),
      default: AttachmentType.OTHER,
    },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const noteSchema = new Schema<INote>(
  {
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true, versionKey: false },
);

const leadSchema = new Schema<ILead>(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      index: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    alternatePhone: {
      type: String,
      trim: true,
      default: "",
    },

    company: {
      type: String,
      trim: true,
      default: "",
    },

    website: {
      type: String,
      trim: true,
      default: "",
    },

    industry: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    jobTitle: {
      type: String,
      trim: true,
      default: "",
    },

    employeeSize: {
      type: String,
      trim: true,
      default: "",
    },

    country: {
      type: String,
      trim: true,
      default: "",
    },

    state: {
      type: String,
      trim: true,
      default: "",
    },

    city: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    zipCode: {
      type: String,
      trim: true,
      default: "",
    },

    address: {
      type: String,
      trim: true,
      default: "",
    },

    source: {
      type: String,
      enum: Object.values(LeadSource),
      default: LeadSource.MANUAL,
      index: true,
    },

    status: {
      type: String,
      enum: Object.values(LeadStatus),
      default: LeadStatus.NEW,
      index: true,
    },
    contactStatus: {
      type: String,
      enum: Object.values(LeadContactStatus),
      default: null,
      index: true,
    },

    nextContactAt: {
      type: Date,
      default: null,
      index: true,
    },
    location: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    priority: {
      type: String,
      enum: Object.values(LeadPriority),
      default: LeadPriority.MEDIUM,
      index: true,
    },

    pipelineStage: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },

    estimatedValue: {
      type: Number,
      min: 0,
      default: 0,
    },

    expectedCloseDate: {
      type: Date,
      default: null,
    },

    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    preferredContactMethod: {
      type: String,
      enum: Object.values(PreferredContactMethod),
      default: PreferredContactMethod.PHONE,
    },

    tags: {
      type: [String],
      default: [],
    },

    labels: {
      type: [String],
      default: [],
    },

    requirementTitle: {
      type: String,
      trim: true,
      default: "",
    },

    requirementDescription: {
      type: String,
      trim: true,
      default: "",
    },

    budget: {
      type: Number,
      min: 0,
      default: 0,
    },

    timeline: {
      type: String,
      trim: true,
      default: "",
    },

    technologies: {
      type: [String],
      default: [],
    },

    services: {
      type: [String],
      default: [],
    },

    attachments: {
      type: [leadAttachmentSchema],
      required: false,
      default: [],
    },

    notes: {
      type: [noteSchema],
      default: [],
    },

    customFields: {
      type: Schema.Types.Mixed,
      default: {},
    },

    isConverted: {
      type: Boolean,
      default: false,
      index: true,
    },

    convertedAt: {
      type: Date,
      default: null,
    },

    convertedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    clientId: {
      type: Schema.Types.ObjectId,
      ref: "Client",
      default: null,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

leadSchema.virtual("fullName").get(function (this: ILead) {
  return `${this.firstName} ${this.lastName}`;
});

leadSchema.set("toJSON", { virtuals: true });
leadSchema.set("toObject", { virtuals: true });

leadSchema.index({ status: 1, priority: 1 });
leadSchema.index({
  contactStatus: 1,
  nextContactAt: 1,
});

leadSchema.index({
  assignedTo: 1,
  contactStatus: 1,
  nextContactAt: 1,
});
leadSchema.index({ assignedTo: 1, status: 1 });
leadSchema.index({ isDeleted: 1, isConverted: 1 });
leadSchema.index({ createdAt: -1 });

export const Lead = model<ILead>("Lead", leadSchema);
