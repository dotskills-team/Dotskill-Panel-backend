import { Schema, model } from "mongoose";

import {
  KPI_MONTH_REGEX,
  KPI_STATUS,
  KPI_TYPE,
  KPI_UNIT,
} from "./kpi.constant";

import type { IKpi, IKpiBudgetItem, IKpiChangeLogEntry, IKpiExtraItem } from "./kpi.interface";

const extraItemSchema = new Schema<IKpiExtraItem>(
  {
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    unit: { type: String, enum: Object.values(KPI_UNIT), required: true },
    target: { type: Number, required: true, min: [0, "Target cannot be negative."] },
  },
  { _id: false },
);

const budgetItemSchema = new Schema<IKpiBudgetItem>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    amount: { type: Number, required: true, min: [0, "Budget item amount cannot be negative."] },
  },
  { _id: false },
);

const changeLogSchema = new Schema<IKpiChangeLogEntry>(
  {
    by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    at: { type: Date, required: true, default: Date.now },
    // { field: { from, to } }
    changes: { type: Schema.Types.Mixed, required: true },
  },
  { _id: true },
);

const kpiSchema = new Schema<IKpi>(
  {
    type: {
      type: String,
      enum: Object.values(KPI_TYPE),
      required: true,
      index: true,
    },

    month: {
      type: String,
      required: true,
      match: [KPI_MONTH_REGEX, "Month must be in YYYY-MM format."],
      index: true,
    },

    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    targetSales: { type: Number, required: true, min: [0, "Target sales cannot be negative."] },
    targetProjects: { type: Number, required: true, min: [0, "Target projects cannot be negative."] },
    // Total of budgetItems; kept in sync by the pre-validate hook below
    budget: { type: Number, required: true, default: 0, min: [0, "Budget cannot be negative."] },
    budgetItems: { type: [budgetItemSchema], default: [] },

    extraItems: { type: [extraItemSchema], default: [] },

    status: {
      type: String,
      enum: Object.values(KPI_STATUS),
      default: KPI_STATUS.DRAFT,
      index: true,
    },

    note: { type: String, trim: true, maxlength: 2000 },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },

    changeLog: { type: [changeLogSchema], default: [] },
  },
  { timestamps: true },
);

// The budget is the sum of its items. A KPI saved before items existed keeps its old
// total until its items are edited.
kpiSchema.pre("validate", function () {
  if (this.isNew || this.isModified("budgetItems")) {
    const total = (this.budgetItems ?? []).reduce((sum, item) => sum + item.amount, 0);
    this.budget = Math.round(total * 100) / 100;
  }
});

// An individual KPI needs a user, the team KPI must not have one
kpiSchema.pre("validate", function () {
  if (this.type === KPI_TYPE.INDIVIDUAL && !this.user) {
    this.invalidate("user", "User is required for an individual KPI.");
  }
  if (this.type === KPI_TYPE.TEAM && this.user) {
    this.invalidate("user", "A team KPI cannot have a user.");
  }
});

// One individual KPI per (user, month)
kpiSchema.index(
  { user: 1, month: 1 },
  { unique: true, partialFilterExpression: { type: KPI_TYPE.INDIVIDUAL } },
);

// One team KPI per month
kpiSchema.index(
  { month: 1 },
  { unique: true, partialFilterExpression: { type: KPI_TYPE.TEAM } },
);

export const Kpi = model<IKpi>("Kpi", kpiSchema);
