import { Types } from "mongoose";

import { KPI_REPORT_STATUS } from "./kpi-report.constant";

export type KpiReportStatus = (typeof KPI_REPORT_STATUS)[keyof typeof KPI_REPORT_STATUS];

/** Achievement frozen at submit time. Never accepted from the client. */
export interface IKpiReportSnapshot {
  achievedSales: number;
  achievedProjects: number;
}

export interface IKpiReportExtraResult {
  key: string;
  achieved: number;
}

export interface IKpiReport {
  _id?: Types.ObjectId;

  /** The individual KPI this report belongs to (one report per KPI). */
  kpi: Types.ObjectId;
  user: Types.ObjectId;
  /** YYYY-MM */
  month: string;

  /** Set only on submit. */
  snapshot?: IKpiReportSnapshot;

  /** Money in BDT. */
  actualBudgetSpent: number;

  extraItemResults: IKpiReportExtraResult[];

  summary?: string;
  challenges?: string;

  status: KpiReportStatus;

  isLate: boolean;
  submittedAt?: Date;

  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewComment?: string;

  /** Filled when a lead or admin sends the report back to draft. */
  returnedBy?: Types.ObjectId;
  returnedAt?: Date;
  returnComment?: string;

  createdAt?: Date;
  updatedAt?: Date;
}
