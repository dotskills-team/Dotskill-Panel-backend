import { PipelineStage, Types } from "mongoose";

import { ProjectStatus } from "../project/project.interface";

import { getMonthRangeUtc } from "./kpi.month";

export interface Achievement {
  achievedProjects: number;
  achievedSales: number;
}

export const EMPTY_ACHIEVEMENT: Achievement = { achievedProjects: 0, achievedSales: 0 };

/** achieved / target * 100, rounded to 2 decimals. Null when there is no target to measure against. */
export const toPercentage = (achieved: number, target?: number | null): number | null => {
  if (!target || target <= 0) return null;
  return Math.round((achieved / target) * 10000) / 100;
};

interface CreditedPipelineOptions {
  month: string;
  /** Only projects whose client is credited to one of these users are kept. */
  creditedToIds: Types.ObjectId[];
  /** Collection name of the Client model, passed in to keep this file free of model imports. */
  clientsCollection: string;
}

/**
 * The $match for projects that can count towards a KPI month:
 * not soft-deleted, not cancelled, and created inside the Dhaka month.
 */
export const buildCountableProjectMatch = (month: string) => {
  const { start, end } = getMonthRangeUtc(month);

  return {
    isDeleted: { $ne: true },
    status: { $ne: ProjectStatus.CANCELLED },
    createdAt: { $gte: start, $lt: end },
  };
};

/**
 * Shared first stages for every achievement query.
 * After these stages each document is a countable project with `clientDoc` attached,
 * limited to clients credited to the given users.
 */
export const buildCreditedProjectsPipeline = ({
  month,
  creditedToIds,
  clientsCollection,
}: CreditedPipelineOptions): PipelineStage[] => [
  { $match: buildCountableProjectMatch(month) },
  {
    $lookup: {
      from: clientsCollection,
      localField: "client",
      foreignField: "_id",
      as: "clientDoc",
    },
  },
  { $unwind: "$clientDoc" },
  { $match: { "clientDoc.creditedTo": { $in: creditedToIds } } },
];

/** Readable client name from the few name fields we project. */
export const clientDisplayName = (client?: {
  companyName?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
} | null): string => {
  if (!client) return "";
  return (
    client.companyName?.trim() ||
    client.fullName?.trim() ||
    [client.firstName, client.lastName].filter(Boolean).join(" ").trim()
  );
};
