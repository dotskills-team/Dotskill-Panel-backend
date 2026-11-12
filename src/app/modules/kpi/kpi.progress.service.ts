import httpStatus from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";
import { Types } from "mongoose";

import AppError from "../../errorHelpers/appError";
import { isKpiAdmin, isMarketingSalesLead, isMarketingSalesTeam } from "../../utils/roleHelpers";
import { sanitizeProjectForRole } from "../../utils/projectValue";
import { Role, UserStatus } from "../user/user.interface";
import { User } from "../user/user.model";

import { KpiAchievementServices } from "./kpi.achievement.service";
import { Achievement, EMPTY_ACHIEVEMENT, toPercentage } from "./kpi.achievement.utils";
import { KPI_READER_VISIBLE_STATUSES, KPI_TYPE } from "./kpi.constant";
import { currentDhakaMonth } from "./kpi.month";
import { Kpi } from "./kpi.model";
import { KpiServices } from "./kpi.service";

/**
 * KPI progress: targets (Kpi module) next to achievements (KpiAchievementServices).
 * Responses only carry totals. Project values are returned by getProjectBreakdown, which is admin-only.
 */

interface KpiTargets {
  targetSales?: number;
  targetProjects?: number;
}

const percentages = (achievement: Achievement, kpi?: KpiTargets | null) => ({
  sales: toPercentage(achievement.achievedSales, kpi?.targetSales),
  projects: toPercentage(achievement.achievedProjects, kpi?.targetProjects),
});

const isAdminRole = (role: string) => isKpiAdmin(role);

/** The caller's own progress, the team progress and the caller's credited projects (no values). */
const getMyProgress = async (month: string | undefined, token: JwtPayload) => {
  const role = String(token.role);
  const userId = String(token.userId);

  if (!isMarketingSalesTeam(role)) {
    throw new AppError(httpStatus.FORBIDDEN, "Only marketing/sales team members have personal progress.");
  }

  const targetMonth = month ?? currentDhakaMonth();

  // KPI visibility (no drafts for members) is decided by the KPI service
  const { data: kpis } = await KpiServices.getMyKpis(targetMonth, token);
  const individualKpi = kpis.individual as (KpiTargets & Record<string, unknown>) | null;
  const teamKpi = kpis.team as (KpiTargets & Record<string, unknown>) | null;

  const [achievement, teamAchievement, credited] = await Promise.all([
    KpiAchievementServices.getAchievement(userId, targetMonth),
    KpiAchievementServices.getTeamAchievement(targetMonth),
    KpiAchievementServices.getCreditedProjectsWithoutValue(userId, targetMonth),
  ]);

  // Second layer: strip any money field, even though the query already leaves them out
  const creditedProjects = credited.map((project) => sanitizeProjectForRole(project, role));

  return {
    data: {
      month: targetMonth,
      individual: {
        kpi: individualKpi,
        achievement,
        percentages: percentages(achievement, individualKpi),
      },
      team: {
        kpi: teamKpi,
        achievement: teamAchievement,
        percentages: percentages(teamAchievement, teamKpi),
      },
      creditedProjects,
    },
  };
};

/** Every team member's KPI vs achievement, plus the team KPI vs the team achievement. Totals only. */
const getProgress = async (month: string | undefined, token: JwtPayload) => {
  const role = String(token.role);
  if (!isAdminRole(role) && !isMarketingSalesLead(role)) {
    throw new AppError(httpStatus.FORBIDDEN, "You do not have permission to view KPI progress.");
  }

  const targetMonth = month ?? currentDhakaMonth();

  const [individualKpis, teamKpi, byUser, teamAchievement, activeMembers] = await Promise.all([
    // The lead and admins see individual KPIs in any status
    Kpi.find({ type: KPI_TYPE.INDIVIDUAL, month: targetMonth }).lean(),
    Kpi.findOne({
      type: KPI_TYPE.TEAM,
      month: targetMonth,
      // The lead sees the team KPI only once it is live
      ...(isAdminRole(role) ? {} : { status: { $in: KPI_READER_VISIBLE_STATUSES } }),
    }).lean(),
    KpiAchievementServices.getAchievementsByUser(targetMonth),
    KpiAchievementServices.getTeamAchievement(targetMonth),
    User.find({
      isDeleted: false,
      status: UserStatus.ACTIVE,
      role: { $in: [Role.SALES_MARKETING, Role.MARKETING_SALES_LEAD] },
    })
      .select("_id")
      .lean(),
  ]);

  const kpiByUser = new Map(individualKpis.map((k) => [String(k.user), k]));

  // Active members, plus anyone who has a KPI or credited work this month (e.g. someone who left)
  const ids = new Set<string>([
    ...activeMembers.map((u) => String(u._id)),
    ...kpiByUser.keys(),
    ...byUser.keys(),
  ]);

  const users = await User.find({ _id: { $in: [...ids].map((id) => new Types.ObjectId(id)) } })
    .select("firstName lastName email role designation status isDeleted")
    .lean();

  const members = users
    .filter((u) => isMarketingSalesTeam(u.role))
    .map((u) => {
      const kpi = kpiByUser.get(String(u._id)) ?? null;
      const achievement = byUser.get(String(u._id)) ?? { ...EMPTY_ACHIEVEMENT };

      return {
        user: {
          _id: u._id,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          role: u.role,
          designation: u.designation,
          isActive: !u.isDeleted && u.status === UserStatus.ACTIVE,
        },
        kpi: kpi
          ? {
              _id: kpi._id,
              status: kpi.status,
              targetSales: kpi.targetSales,
              targetProjects: kpi.targetProjects,
              budget: kpi.budget,
              extraItems: kpi.extraItems,
            }
          : null,
        achievement,
        percentages: percentages(achievement, kpi),
      };
    })
    .sort((a, b) =>
      `${a.user.firstName} ${a.user.lastName}`.localeCompare(`${b.user.firstName} ${b.user.lastName}`),
    );

  return {
    data: {
      month: targetMonth,
      members,
      team: {
        kpi: teamKpi
          ? {
              _id: teamKpi._id,
              status: teamKpi.status,
              targetSales: teamKpi.targetSales,
              targetProjects: teamKpi.targetProjects,
              budget: teamKpi.budget,
              extraItems: teamKpi.extraItems,
            }
          : null,
        achievement: teamAchievement,
        percentages: percentages(teamAchievement, teamKpi),
      },
    },
  };
};

/** Admin only: each credited project with its value. */
const getProjectBreakdown = async (
  month: string | undefined,
  userId: string | undefined,
  token: JwtPayload,
) => {
  if (!isAdminRole(String(token.role))) {
    throw new AppError(httpStatus.FORBIDDEN, "Only an admin can view project values.");
  }

  const targetMonth = month ?? currentDhakaMonth();
  const result = await KpiAchievementServices.getProjectBreakdown(targetMonth, userId);

  return { data: { month: targetMonth, userId: userId ?? null, ...result } };
};

export const KpiProgressServices = {
  getMyProgress,
  getProgress,
  getProjectBreakdown,
};
