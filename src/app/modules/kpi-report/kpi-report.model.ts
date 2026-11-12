import { Schema, model } from "mongoose";

import { KPI_MONTH_REGEX } from "../kpi/kpi.constant";

import {
  KPI_REPORT_COMMENT_MAX,
  KPI_REPORT_STATUS,
  KPI_REPORT_TEXT_MAX,
} from "./kpi-report.constant";

import type {
  IKpiReport,
  IKpiReportExtraResult,
  IKpiReportSnapshot,
} from "./kpi-report.interface";

const snapshotSchema = new Schema<IKpiReportSnapshot>(
  {
    achievedSales: { type: Number, required: true, min: 0 },
    achievedProjects: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const extraResultSchema = new Schema<IKpiReportExtraResult>(
  {
    key: { type: String, required: true, trim: true },
    achieved: { type: Number, required: true, min: [0, "Achieved value cannot be negative."] },
  },
  { _id: false },
);

const kpiReportSchema = new Schema<IKpiReport>(
  {
    // One report per individual KPI
    kpi: { type: Schema.Types.ObjectId, ref: "Kpi", required: true, unique: true },

    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    month: {
      type: String,
      required: true,
      match: [KPI_MONTH_REGEX, "Month must be in YYYY-MM format."],
      index: true,
    },

    snapshot: { type: snapshotSchema },

    actualBudgetSpent: { type: Number, default: 0, min: [0, "Budget spent cannot be negative."] },

    extraItemResults: { type: [extraResultSchema], default: [] },

    summary: { type: String, trim: true, maxlength: KPI_REPORT_TEXT_MAX },
    challenges: { type: String, trim: true, maxlength: KPI_REPORT_TEXT_MAX },

    status: {
      type: String,
      enum: Object.values(KPI_REPORT_STATUS),
      default: KPI_REPORT_STATUS.DRAFT,
      index: true,
    },

    isLate: { type: Boolean, default: false },
    submittedAt: { type: Date },

    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    reviewComment: { type: String, trim: true, maxlength: KPI_REPORT_COMMENT_MAX },

    returnedBy: { type: Schema.Types.ObjectId, ref: "User" },
    returnedAt: { type: Date },
    returnComment: { type: String, trim: true, maxlength: KPI_REPORT_COMMENT_MAX },
  },
  { timestamps: true },
);

export const KpiReport = model<IKpiReport>("KpiReport", kpiReportSchema);
