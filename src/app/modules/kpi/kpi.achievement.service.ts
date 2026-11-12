import httpStatus from "http-status-codes";
import { PipelineStage, Types } from "mongoose";

import AppError from "../../errorHelpers/appError";
import { isMarketingSalesTeam } from "../../utils/roleHelpers";
import { Client } from "../clients/client.model";
import { Project } from "../project/project.model";
import { Role } from "../user/user.interface";
import { User } from "../user/user.model";

import {
  Achievement,
  EMPTY_ACHIEVEMENT,
  buildCreditedProjectsPipeline,
  clientDisplayName,
} from "./kpi.achievement.utils";
import { isValidKpiMonth } from "./kpi.month";

/**
 * Achievement calculation. All summing happens in MongoDB.
 *
 * Rules:
 * - A project is credited to Client.creditedTo of its client.
 * - The month is the project's createdAt in Asia/Dhaka.
 * - Cancelled and soft-deleted projects are ignored.
 * - Only users who pass isMarketingSalesTeam are counted; credits to anyone else are ignored.
 * - "Sales" is the sum of the project budget (the project value).
 */

const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));

const assertMonth = (month: string) => {
  if (!isValidKpiMonth(month)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Month must be in YYYY-MM format.");
  }
};

/** Ids of every user who passes isMarketingSalesTeam (any status, so past work still counts). */
const getTeamUserIds = async (): Promise<Types.ObjectId[]> => {
  const users = await User.find({
    role: { $in: [Role.SALES_MARKETING, Role.MARKETING_SALES_LEAD] },
  })
    .select("role")
    .lean();

  return users.filter((u) => isMarketingSalesTeam(u.role)).map((u) => u._id as Types.ObjectId);
};

const creditedPipeline = (month: string, creditedToIds: Types.ObjectId[]): PipelineStage[] =>
  buildCreditedProjectsPipeline({
    month,
    creditedToIds,
    clientsCollection: Client.collection.name,
  });

/** Achievement of one user. Users outside the marketing/sales team always get zeros. */
const getAchievement = async (userId: string, month: string): Promise<Achievement> => {
  assertMonth(month);
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid user id.");
  }

  const user = await User.findById(userId).select("role").lean();
  if (!user || !isMarketingSalesTeam(user.role)) return { ...EMPTY_ACHIEVEMENT };

  const [row] = await Project.aggregate([
    ...creditedPipeline(month, [oid(userId)]),
    {
      $group: {
        _id: null,
        achievedProjects: { $sum: 1 },
        achievedSales: { $sum: { $ifNull: ["$budget", 0] } },
      },
    },
  ]);

  return {
    achievedProjects: row?.achievedProjects ?? 0,
    achievedSales: row?.achievedSales ?? 0,
  };
};

/** Sum of the achievements of every marketing/sales team member. */
const getTeamAchievement = async (month: string): Promise<Achievement> => {
  assertMonth(month);

  const teamIds = await getTeamUserIds();
  if (teamIds.length === 0) return { ...EMPTY_ACHIEVEMENT };

  const [row] = await Project.aggregate([
    ...creditedPipeline(month, teamIds),
    {
      $group: {
        _id: null,
        achievedProjects: { $sum: 1 },
        achievedSales: { $sum: { $ifNull: ["$budget", 0] } },
      },
    },
  ]);

  return {
    achievedProjects: row?.achievedProjects ?? 0,
    achievedSales: row?.achievedSales ?? 0,
  };
};

/** Achievement per team member in one query. Members with no credited project are absent. */
const getAchievementsByUser = async (month: string): Promise<Map<string, Achievement>> => {
  assertMonth(month);

  const map = new Map<string, Achievement>();
  const teamIds = await getTeamUserIds();
  if (teamIds.length === 0) return map;

  const rows = await Project.aggregate([
    ...creditedPipeline(month, teamIds),
    {
      $group: {
        _id: "$clientDoc.creditedTo",
        achievedProjects: { $sum: 1 },
        achievedSales: { $sum: { $ifNull: ["$budget", 0] } },
      },
    },
  ]);

  rows.forEach((row) => {
    map.set(String(row._id), {
      achievedProjects: row.achievedProjects,
      achievedSales: row.achievedSales,
    });
  });

  return map;
};

export interface CreditedProjectSummary {
  _id: string;
  name: string;
  status: string;
  clientName: string;
  createdAt: Date;
}

/**
 * The projects credited to one user in the month, WITHOUT any value.
 * The explicit $project below is an allow-list, so money fields can never leak into this list.
 */
const getCreditedProjectsWithoutValue = async (
  userId: string,
  month: string,
): Promise<CreditedProjectSummary[]> => {
  assertMonth(month);

  const user = await User.findById(userId).select("role").lean();
  if (!user || !isMarketingSalesTeam(user.role)) return [];

  const rows = await Project.aggregate([
    ...creditedPipeline(month, [oid(userId)]),
    { $sort: { createdAt: 1 } },
    {
      $project: {
        _id: 1,
        name: 1,
        status: 1,
        createdAt: 1,
        "clientDoc.firstName": 1,
        "clientDoc.lastName": 1,
        "clientDoc.fullName": 1,
        "clientDoc.companyName": 1,
      },
    },
  ]);

  return rows.map((row) => ({
    _id: String(row._id),
    name: row.name,
    status: row.status,
    clientName: clientDisplayName(row.clientDoc),
    createdAt: row.createdAt,
  }));
};

export interface ProjectBreakdownRow {
  projectId: string;
  name: string;
  status: string;
  createdAt: Date;
  client: { _id: string; name: string };
  creditedTo: { _id: string; name: string };
  /** Project value (BDT). Admin-only endpoint. */
  value: number;
}

/** Per-project breakdown including each project's value. Callers must be admin-level. */
const getProjectBreakdown = async (month: string, userId?: string) => {
  assertMonth(month);

  let creditedToIds: Types.ObjectId[];
  if (userId) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid user id.");
    }
    const user = await User.findById(userId).select("role").lean();
    creditedToIds = user && isMarketingSalesTeam(user.role) ? [oid(userId)] : [];
  } else {
    creditedToIds = await getTeamUserIds();
  }

  if (creditedToIds.length === 0) {
    return { projects: [] as ProjectBreakdownRow[], totals: { ...EMPTY_ACHIEVEMENT } };
  }

  const rows = await Project.aggregate([
    ...creditedPipeline(month, creditedToIds),
    {
      $lookup: {
        from: User.collection.name,
        localField: "clientDoc.creditedTo",
        foreignField: "_id",
        as: "creditedUser",
      },
    },
    { $unwind: { path: "$creditedUser", preserveNullAndEmptyArrays: true } },
    { $sort: { createdAt: 1 } },
    {
      $project: {
        name: 1,
        status: 1,
        createdAt: 1,
        budget: 1,
        "clientDoc._id": 1,
        "clientDoc.firstName": 1,
        "clientDoc.lastName": 1,
        "clientDoc.fullName": 1,
        "clientDoc.companyName": 1,
        "clientDoc.creditedTo": 1,
        "creditedUser.firstName": 1,
        "creditedUser.lastName": 1,
      },
    },
  ]);

  const projects: ProjectBreakdownRow[] = rows.map((row) => ({
    projectId: String(row._id),
    name: row.name,
    status: row.status,
    createdAt: row.createdAt,
    client: { _id: String(row.clientDoc._id), name: clientDisplayName(row.clientDoc) },
    creditedTo: {
      _id: String(row.clientDoc.creditedTo),
      name: [row.creditedUser?.firstName, row.creditedUser?.lastName].filter(Boolean).join(" "),
    },
    value: row.budget ?? 0,
  }));

  // Totals come from the same aggregation rules as everywhere else, not from summing here
  const totals = userId ? await getAchievement(userId, month) : await getTeamAchievement(month);

  return { projects, totals };
};

export const KpiAchievementServices = {
  getAchievement,
  getTeamAchievement,
  getAchievementsByUser,
  getCreditedProjectsWithoutValue,
  getProjectBreakdown,
};
