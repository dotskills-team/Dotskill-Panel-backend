import httpStatus from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";
import { HydratedDocument, QueryFilter, Types } from "mongoose";

import AppError from "../../errorHelpers/appError";
import { isKpiAdmin, isMarketingSalesLead, isMarketingSalesTeam } from "../../utils/roleHelpers";
import { KpiAchievementServices } from "../kpi/kpi.achievement.service";
import {
  Achievement,
  EMPTY_ACHIEVEMENT,
  toPercentage,
} from "../kpi/kpi.achievement.utils";
import { KPI_READER_VISIBLE_STATUSES, KPI_TYPE } from "../kpi/kpi.constant";
import { Kpi } from "../kpi/kpi.model";
import { currentDhakaMonth, isValidKpiMonth } from "../kpi/kpi.month";
import type { IKpi } from "../kpi/kpi.interface";
import { Role } from "../user/user.interface";
import { User } from "../user/user.model";

import { KPI_REPORT_STATUS } from "./kpi-report.constant";
import { KpiReport } from "./kpi-report.model";
import {
  canSubmitReport,
  checkExtraResultKeys,
  getReportDeadline,
  getSubmitOpensAt,
  isLateSubmission,
} from "./kpi-report.utils";

import type { IKpiReport } from "./kpi-report.interface";
import type { ListReportQuery, ReportContentInput } from "./kpi-report.validation";

type ReportDoc = HydratedDocument<IKpiReport>;
type KpiDoc = HydratedDocument<IKpi>;

interface Actor {
  userId: string;
  role: string;
}

const toActor = (token: JwtPayload): Actor => ({
  userId: String(token.userId),
  role: String(token.role),
});

const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));

const isAdmin = (role: string) => isKpiAdmin(role);

const assertMonth = (month: string) => {
  if (!isValidKpiMonth(month)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Month must be in YYYY-MM format.");
  }
};

const USER_FIELDS = "firstName lastName email role designation";
const PERSON_FIELDS = "firstName lastName email";

const REPORT_POPULATE = [
  { path: "user", select: USER_FIELDS },
  { path: "kpi", select: "month status targetSales targetProjects budget extraItems" },
  { path: "reviewedBy", select: PERSON_FIELDS },
  { path: "returnedBy", select: PERSON_FIELDS },
];

/* --------------------------------- helpers ------------------------------- */

/** The caller's own individual KPI of the month; reports exist only for active or closed KPIs. */
const requireOwnKpi = async (actor: Actor, month: string): Promise<KpiDoc> => {
  assertMonth(month);

  if (!isMarketingSalesTeam(actor.role)) {
    throw new AppError(httpStatus.FORBIDDEN, "Only marketing/sales team members have KPI reports.");
  }

  const kpi = await Kpi.findOne({
    type: KPI_TYPE.INDIVIDUAL,
    month,
    user: oid(actor.userId),
    status: { $in: KPI_READER_VISIBLE_STATUSES },
  });

  if (!kpi) {
    throw new AppError(httpStatus.NOT_FOUND, "You have no active KPI for this month.");
  }

  return kpi;
};

const kpiSummary = (kpi: IKpi) => ({
  _id: kpi._id,
  month: kpi.month,
  status: kpi.status,
  targetSales: kpi.targetSales,
  targetProjects: kpi.targetProjects,
  budget: kpi.budget,
  extraItems: kpi.extraItems,
});

const present = (report: ReportDoc | null) => (report ? report.toJSON() : null);

const percentagesFor = (
  achievement: Achievement,
  kpi?: { targetSales?: number; targetProjects?: number } | null,
) => ({
  sales: toPercentage(achievement.achievedSales, kpi?.targetSales),
  projects: toPercentage(achievement.achievedProjects, kpi?.targetProjects),
});

/** Applies the owner-editable fields, checking extra item keys against the KPI. */
const applyContent = (report: ReportDoc, kpi: IKpi, input: ReportContentInput) => {
  if (input.extraItemResults !== undefined) {
    const error = checkExtraResultKeys(
      kpi.extraItems.map((item) => item.key),
      input.extraItemResults.map((result) => result.key),
      false,
    );
    if (error) throw new AppError(httpStatus.BAD_REQUEST, error);
    report.extraItemResults = input.extraItemResults;
  }

  if (input.actualBudgetSpent !== undefined) report.actualBudgetSpent = input.actualBudgetSpent;
  if (input.summary !== undefined) report.summary = input.summary;
  if (input.challenges !== undefined) report.challenges = input.challenges;
};

const newDraft = (kpi: KpiDoc): ReportDoc =>
  new KpiReport({
    kpi: kpi._id,
    user: kpi.user,
    month: kpi.month,
    status: KPI_REPORT_STATUS.DRAFT,
  });

const saveReport = async (report: ReportDoc) => {
  try {
    await report.save();
  } catch (error) {
    // The unique index on kpi: someone created the report between our read and write
    if ((error as { code?: number })?.code === 11000) {
      throw new AppError(httpStatus.CONFLICT, "This report was just created. Reload and try again.");
    }
    throw error;
  }
};

/** Lead: reports of regular members only, never their own. Admin: anyone's. */
const assertCanModerate = async (report: ReportDoc, actor: Actor) => {
  if (isAdmin(actor.role)) return;

  if (!isMarketingSalesLead(actor.role)) {
    throw new AppError(httpStatus.FORBIDDEN, "You do not have permission to moderate KPI reports.");
  }

  if (String(report.user) === actor.userId) {
    throw new AppError(httpStatus.FORBIDDEN, "You cannot review your own report.");
  }

  const owner = await User.findById(report.user).select("role").lean();
  if (owner?.role !== Role.SALES_MARKETING) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only an admin can review this report.",
    );
  }
};

const getReportOrThrow = async (id: string): Promise<ReportDoc> => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid report id.");
  }
  const report = await KpiReport.findById(id);
  if (!report) throw new AppError(httpStatus.NOT_FOUND, "Report not found.");
  return report;
};

/* ------------------------------ owner endpoints -------------------------- */

/** The caller's report (or an empty draft shape) with live achievement values. */
const getMyReport = async (month: string, token: JwtPayload) => {
  const actor = toActor(token);
  const kpi = await requireOwnKpi(actor, month);

  const [report, liveAchievement] = await Promise.all([
    KpiReport.findOne({ kpi: kpi._id }).populate(REPORT_POPULATE.slice(2)),
    KpiAchievementServices.getAchievement(actor.userId, month),
  ]);

  const now = new Date();
  const status = report?.status ?? KPI_REPORT_STATUS.DRAFT;

  // Once submitted the frozen snapshot is the official number; before that, show live values
  const shown = report?.snapshot
    ? {
        achievedSales: report.snapshot.achievedSales,
        achievedProjects: report.snapshot.achievedProjects,
      }
    : liveAchievement;

  return {
    data: {
      month,
      kpi: kpiSummary(kpi),
      report:
        present(report) ?? {
          // Empty draft shape for a report that was never saved
          _id: null,
          kpi: kpi._id,
          user: kpi.user,
          month,
          status: KPI_REPORT_STATUS.DRAFT,
          actualBudgetSpent: 0,
          extraItemResults: kpi.extraItems.map((item) => ({ key: item.key, achieved: 0 })),
          summary: "",
          challenges: "",
          isLate: false,
        },
      liveAchievement,
      percentages: percentagesFor(shown, kpi),
      timing: {
        submitOpensAt: getSubmitOpensAt(month),
        deadlineAt: getReportDeadline(month),
        canSubmit: status === KPI_REPORT_STATUS.DRAFT && canSubmitReport(month, now),
        isPastDeadline: now.getTime() > getReportDeadline(month).getTime(),
      },
    },
  };
};

/** Saves the owner's draft. Locked once submitted. */
const saveDraft = async (month: string, input: ReportContentInput, token: JwtPayload) => {
  const actor = toActor(token);
  const kpi = await requireOwnKpi(actor, month);

  const report = (await KpiReport.findOne({ kpi: kpi._id })) ?? newDraft(kpi);

  if (report.status !== KPI_REPORT_STATUS.DRAFT) {
    throw new AppError(
      httpStatus.CONFLICT,
      "This report was submitted and can no longer be edited. Ask your lead to return it.",
    );
  }

  applyContent(report, kpi, input);
  await saveReport(report);
  await report.populate(REPORT_POPULATE.slice(2));

  return { data: present(report) };
};

/**
 * Submits the report. Allowed from the last day of the month.
 * The achievement is computed here and frozen as the snapshot; the client cannot send it.
 */
const submitReport = async (month: string, input: ReportContentInput, token: JwtPayload) => {
  const actor = toActor(token);
  const kpi = await requireOwnKpi(actor, month);

  const now = new Date();
  if (!canSubmitReport(month, now)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A report can be submitted from the last day of its month.",
    );
  }

  const report = (await KpiReport.findOne({ kpi: kpi._id })) ?? newDraft(kpi);

  if (report.status !== KPI_REPORT_STATUS.DRAFT) {
    throw new AppError(httpStatus.CONFLICT, "This report was already submitted.");
  }

  // Optional last-minute edits sent together with the submit
  applyContent(report, kpi, input);

  // On submit every extra item needs a result
  const completeness = checkExtraResultKeys(
    kpi.extraItems.map((item) => item.key),
    report.extraItemResults.map((result) => result.key),
    true,
  );
  if (completeness) throw new AppError(httpStatus.BAD_REQUEST, completeness);

  const achievement = await KpiAchievementServices.getAchievement(actor.userId, month);

  report.snapshot = {
    achievedSales: achievement.achievedSales,
    achievedProjects: achievement.achievedProjects,
  };
  report.status = KPI_REPORT_STATUS.SUBMITTED;
  report.submittedAt = now;
  report.isLate = isLateSubmission(month, now);

  // A resubmission after a return starts clean
  report.returnedBy = undefined;
  report.returnedAt = undefined;
  report.returnComment = undefined;

  await saveReport(report);
  await report.populate(REPORT_POPULATE.slice(2));

  return { data: present(report) };
};

/* --------------------------- lead / admin endpoints ---------------------- */

const getReports = async (query: ListReportQuery, token: JwtPayload) => {
  const actor = toActor(token);

  const filters: QueryFilter<IKpiReport> = {};
  if (query.month) filters.month = query.month;
  if (query.status) filters.status = query.status;

  const clauses: QueryFilter<IKpiReport>[] = [filters];
  if (query.userId) clauses.push({ user: oid(query.userId) });

  if (!isAdmin(actor.role)) {
    if (!isMarketingSalesLead(actor.role)) {
      throw new AppError(httpStatus.FORBIDDEN, "You do not have permission to view KPI reports.");
    }
    // The lead sees regular members' reports, not their own or other leads'
    const memberIds = await User.find({ role: Role.SALES_MARKETING }).distinct("_id");
    clauses.push({ user: { $in: memberIds } });
  }

  const filter: QueryFilter<IKpiReport> = { $and: clauses };
  const skip = (query.page - 1) * query.limit;

  const [rows, total] = await Promise.all([
    KpiReport.find(filter)
      .sort({ month: -1, updatedAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate(REPORT_POPULATE),
    KpiReport.countDocuments(filter),
  ]);

  return {
    data: rows.map((row) => row.toJSON()),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPage: Math.ceil(total / query.limit),
    },
  };
};

/** Marks a submitted report as reviewed. */
const reviewReport = async (id: string, comment: string | undefined, token: JwtPayload) => {
  const actor = toActor(token);
  const report = await getReportOrThrow(id);
  await assertCanModerate(report, actor);

  if (report.status !== KPI_REPORT_STATUS.SUBMITTED) {
    throw new AppError(httpStatus.BAD_REQUEST, "Only a submitted report can be reviewed.");
  }

  report.status = KPI_REPORT_STATUS.REVIEWED;
  report.reviewedBy = oid(actor.userId);
  report.reviewedAt = new Date();
  report.reviewComment = comment;
  await report.save();
  await report.populate(REPORT_POPULATE);

  return { data: present(report) };
};

/** Sends a submitted or reviewed report back to draft, with a comment for the owner. */
const returnReport = async (id: string, comment: string, token: JwtPayload) => {
  const actor = toActor(token);
  const report = await getReportOrThrow(id);
  await assertCanModerate(report, actor);

  if (report.status === KPI_REPORT_STATUS.DRAFT) {
    throw new AppError(httpStatus.BAD_REQUEST, "This report is already a draft.");
  }

  report.status = KPI_REPORT_STATUS.DRAFT;
  report.returnedBy = oid(actor.userId);
  report.returnedAt = new Date();
  report.returnComment = comment;

  // The numbers are recalculated when the owner submits again
  report.snapshot = undefined;
  report.submittedAt = undefined;
  report.isLate = false;
  report.reviewedBy = undefined;
  report.reviewedAt = undefined;
  report.reviewComment = undefined;

  await report.save();
  await report.populate(REPORT_POPULATE);

  return { data: present(report) };
};

/* --------------------------------- summary ------------------------------- */

interface PopulatedKpi {
  _id: Types.ObjectId;
  status: string;
  targetSales: number;
  targetProjects: number;
  budget: number;
  user: {
    _id: Types.ObjectId;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    designation?: string;
  } | null;
}

/**
 * Per person: target vs achieved, plus the team KPI vs the team total. Totals only.
 * A submitted or reviewed report counts with its frozen snapshot; everyone else with live values.
 */
const getSummary = async (month: string | undefined, token: JwtPayload) => {
  const actor = toActor(token);
  if (!isAdmin(actor.role) && !isMarketingSalesLead(actor.role)) {
    throw new AppError(httpStatus.FORBIDDEN, "You do not have permission to view the KPI summary.");
  }

  const targetMonth = month ?? currentDhakaMonth();
  assertMonth(targetMonth);

  const [kpis, reports, liveByUser, liveTeam, teamKpi] = await Promise.all([
    Kpi.find({ type: KPI_TYPE.INDIVIDUAL, month: targetMonth })
      .populate({ path: "user", select: USER_FIELDS })
      .lean() as unknown as Promise<PopulatedKpi[]>,
    KpiReport.find({ month: targetMonth })
      .select("kpi status isLate snapshot actualBudgetSpent submittedAt")
      .lean(),
    KpiAchievementServices.getAchievementsByUser(targetMonth),
    KpiAchievementServices.getTeamAchievement(targetMonth),
    Kpi.findOne({
      type: KPI_TYPE.TEAM,
      month: targetMonth,
      // The lead sees the team KPI only once it is live
      ...(isAdmin(actor.role) ? {} : { status: { $in: KPI_READER_VISIBLE_STATUSES } }),
    }).lean(),
  ]);

  const reportByKpi = new Map(reports.map((r) => [String(r.kpi), r]));

  const people = kpis
    .filter((kpi) => kpi.user && isMarketingSalesTeam(kpi.user.role))
    .map((kpi) => {
      const user = kpi.user!;
      const report = reportByKpi.get(String(kpi._id)) ?? null;
      const frozen = report?.snapshot && report.status !== KPI_REPORT_STATUS.DRAFT;

      const achievement: Achievement = frozen
        ? {
            achievedSales: report!.snapshot!.achievedSales,
            achievedProjects: report!.snapshot!.achievedProjects,
          }
        : (liveByUser.get(String(user._id)) ?? { ...EMPTY_ACHIEVEMENT });

      return {
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          designation: user.designation,
        },
        kpi: {
          _id: kpi._id,
          status: kpi.status,
          targetSales: kpi.targetSales,
          targetProjects: kpi.targetProjects,
          budget: kpi.budget,
        },
        report: {
          status: report?.status ?? "none",
          isLate: report?.isLate ?? false,
          submittedAt: report?.submittedAt ?? null,
        },
        achievementSource: frozen ? "snapshot" : "live",
        achievement,
        percentages: percentagesFor(achievement, kpi),
        budget: {
          planned: kpi.budget,
          spent: report ? report.actualBudgetSpent : null,
        },
      };
    })
    .sort((a, b) =>
      `${a.user.firstName} ${a.user.lastName}`.localeCompare(`${b.user.firstName} ${b.user.lastName}`),
    );

  // Team total = what the rows above add up to (snapshots for submitted reports, live for the rest)
  const teamTotal = people.reduce<Achievement>(
    (sum, person) => ({
      achievedSales: sum.achievedSales + person.achievement.achievedSales,
      achievedProjects: sum.achievedProjects + person.achievement.achievedProjects,
    }),
    { ...EMPTY_ACHIEVEMENT },
  );

  return {
    data: {
      month: targetMonth,
      people,
      team: {
        kpi: teamKpi
          ? {
              _id: teamKpi._id,
              status: teamKpi.status,
              targetSales: teamKpi.targetSales,
              targetProjects: teamKpi.targetProjects,
              budget: teamKpi.budget,
            }
          : null,
        achievement: teamTotal,
        percentages: percentagesFor(teamTotal, teamKpi),
        // Live total over all credited work, for comparison with the figures above
        liveAchievement: liveTeam,
      },
    },
  };
};

export const KpiReportServices = {
  getMyReport,
  saveDraft,
  submitReport,
  getReports,
  reviewReport,
  returnReport,
  getSummary,
};
