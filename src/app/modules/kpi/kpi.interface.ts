import { Types } from "mongoose";

import { KPI_STATUS, KPI_TYPE, KPI_UNIT } from "./kpi.constant";

export type KpiType = (typeof KPI_TYPE)[keyof typeof KPI_TYPE];
export type KpiStatus = (typeof KPI_STATUS)[keyof typeof KPI_STATUS];
export type KpiUnit = (typeof KPI_UNIT)[keyof typeof KPI_UNIT];

/** A custom target on top of sales, projects and budget. */
export interface IKpiExtraItem {
  key: string;
  name: string;
  unit: KpiUnit;
  target: number;
}

/** One line of the budget. The KPI budget is always the sum of these amounts. */
export interface IKpiBudgetItem {
  name: string;
  amount: number;
}

export interface IKpiChange {
  from: unknown;
  to: unknown;
}

export interface IKpiChangeLogEntry {
  _id?: Types.ObjectId;
  by: Types.ObjectId;
  at: Date;
  changes: Record<string, IKpiChange>;
}

export interface IKpi {
  _id?: Types.ObjectId;

  type: KpiType;

  /** Month as YYYY-MM. */
  month: string;

  /** Required for individual KPIs, absent for the team KPI. */
  user?: Types.ObjectId;

  /** All money values are in BDT (taka). */
  targetSales: number;
  targetProjects: number;
  /** Total budget: calculated from budgetItems, never set directly. */
  budget: number;
  budgetItems: IKpiBudgetItem[];

  extraItems: IKpiExtraItem[];

  status: KpiStatus;

  note?: string;

  createdBy: Types.ObjectId;

  changeLog: IKpiChangeLogEntry[];

  createdAt?: Date;
  updatedAt?: Date;
}
