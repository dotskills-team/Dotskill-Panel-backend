import httpStatus from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";
import { QueryFilter, HydratedDocument, Types } from "mongoose";

import AppError from "../../errorHelpers/appError";
import { isKpiAdmin, isMarketingSalesLead, isMarketingSalesTeam } from "../../utils/roleHelpers";
import { Role, UserStatus } from "../user/user.interface";
import { User } from "../user/user.model";

import {
  KPI_READER_VISIBLE_STATUSES,
  KPI_STATUS,
  KPI_STATUS_FLOW,
  KPI_TYPE,
} from "./kpi.constant";
import { currentDhakaMonth } from "./kpi.month";
import { Kpi } from "./kpi.model";
import { KpiReport } from "../kpi-report/kpi-report.model";

import type { IKpi, IKpiBudgetItem, IKpiChange, IKpiExtraItem } from "./kpi.interface";
import type {
  CreateKpiInput,
  ListKpiQuery,
  UpdateKpiInput,
} from "./kpi.validation";

type KpiDoc = HydratedDocument<IKpi>;

interface Actor {
  userId: string;
  role: string;
}

const toActor = (token: JwtPayload): Actor => ({
  userId: String(token.userId),
  role: String(token.role),
});

const oid = (id: string) => new Types.ObjectId(id);

const isAdmin = (role: string) => isKpiAdmin(role);

const USER_POPULATE = {
  path: "user",
  select: "firstName lastName email role designation",
};
const CREATOR_POPULATE = {
  path: "createdBy",
  select: "firstName lastName email",
};
const CHANGELOG_POPULATE = {
  path: "changeLog.by",
  select: "firstName lastName email",
};

const currentMonth = currentDhakaMonth;

/* --------------------------------- access -------------------------------- */

/**
 * Removes data a role should not get back.
 * Only admins see the change log; the lead sees it for individual KPIs only.
 */
const present = (kpi: KpiDoc | null, actor: Actor) => {
  if (!kpi) return null;
  const plain = kpi.toJSON() as unknown as Record<string, unknown>;
  const canSeeLog =
    isAdmin(actor.role) ||
    (isMarketingSalesLead(actor.role) && kpi.type === KPI_TYPE.INDIVIDUAL);
  if (!canSeeLog) delete plain.changeLog;
  if (!isAdmin(actor.role) && !isMarketingSalesLead(actor.role)) delete plain.createdBy;
  return plain;
};

const populateKpi = async (kpi: KpiDoc) => {
  await kpi.populate([USER_POPULATE, CREATOR_POPULATE, CHANGELOG_POPULATE]);
  return kpi;
};

/** Who can read what. The returned filter is ANDed with the caller's filters. */
const readScope = (actor: Actor): QueryFilter<IKpi> => {
  if (isAdmin(actor.role)) return {};

  if (isMarketingSalesLead(actor.role)) {
    // Lead: every individual KPI (drafts too), the team KPI only once it is live
    return {
      $or: [
        { type: KPI_TYPE.INDIVIDUAL },
        { type: KPI_TYPE.TEAM, status: { $in: KPI_READER_VISIBLE_STATUSES } },
      ],
    };
  }

  if (isMarketingSalesTeam(actor.role)) {
    // Member: own individual KPI and the team KPI, never drafts
    return {
      $or: [
        {
          type: KPI_TYPE.INDIVIDUAL,
          user: oid(actor.userId),
          status: { $in: KPI_READER_VISIBLE_STATUSES },
        },
        { type: KPI_TYPE.TEAM, status: { $in: KPI_READER_VISIBLE_STATUSES } },
      ],
    };
  }

  throw new AppError(httpStatus.FORBIDDEN, "You do not have permission to view KPIs.");
};

/** A user that an individual KPI can be set for: active and in the marketing/sales team. */
const assertEligibleUser = async (userId: string) => {
  const user = await User.findOne({
    _id: userId,
    isDeleted: false,
    status: UserStatus.ACTIVE,
  })
    .select("role")
    .lean();

  if (!user || !isMarketingSalesTeam(user.role)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "KPI user must be an active marketing/sales team member.",
    );
  }
};

/**
 * The lead manages regular members' KPIs and their own KPI.
 * Another lead's KPI is set by an admin. The team KPI is admin-only (checked by the callers).
 */
const assertLeadMayManage = async (userId: string, actorId: string) => {
  const user = await User.findOne({
    _id: userId,
    isDeleted: false,
    status: UserStatus.ACTIVE,
  })
    .select("role")
    .lean();

  const isOwn = userId === actorId;
  if (!user || (user.role !== Role.SALES_MARKETING && !isOwn)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only an admin can set or change the KPI of another lead.",
    );
  }
};

/** Throws unless the actor may change this KPI (edit or status change). */
const assertCanWrite = async (kpi: KpiDoc, actor: Actor) => {
  if (isAdmin(actor.role)) return;

  if (isMarketingSalesLead(actor.role)) {
    if (kpi.type !== KPI_TYPE.INDIVIDUAL) {
      throw new AppError(httpStatus.FORBIDDEN, "Only an admin can change the team KPI.");
    }
    if (kpi.status === KPI_STATUS.CLOSED) {
      throw new AppError(httpStatus.FORBIDDEN, "A closed KPI can only be changed by an admin.");
    }
    if (kpi.user) await assertLeadMayManage(String(kpi.user), actor.userId);
    return;
  }

  throw new AppError(httpStatus.FORBIDDEN, "You do not have permission to change KPIs.");
};

const getKpiOrThrow = async (id: string): Promise<KpiDoc> => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid KPI id.");
  }
  const kpi = await Kpi.findById(id);
  if (!kpi) throw new AppError(httpStatus.NOT_FOUND, "KPI not found.");
  return kpi;
};

/** Turns a Mongo duplicate-key error into a readable conflict. */
const rethrowDuplicate = (error: unknown): never => {
  if ((error as { code?: number })?.code === 11000) {
    throw new AppError(
      httpStatus.CONFLICT,
      "A KPI already exists for this user/team and month.",
    );
  }
  throw error;
};

/* --------------------------------- diffing ------------------------------- */

const plainItems = (items?: IKpiExtraItem[]) =>
  (items ?? []).map((i) => ({ key: i.key, name: i.name, unit: i.unit, target: i.target }));

const plainBudgetItems = (items?: IKpiBudgetItem[]) =>
  (items ?? []).map((i) => ({ name: i.name, amount: i.amount }));

const sumBudgetItems = (items: IKpiBudgetItem[]) =>
  Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;

const sameValue =(a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Compares the current KPI with the update and returns only real changes. */
const diffUpdate = (kpi: KpiDoc, input: UpdateKpiInput) => {
  const changes: Record<string, IKpiChange> = {};

  (["targetSales", "targetProjects"] as const).forEach((field) => {
    if (input[field] !== undefined && input[field] !== kpi[field]) {
      changes[field] = { from: kpi[field], to: input[field] };
    }
  });

  if (input.budgetItems !== undefined) {
    const from = plainBudgetItems(kpi.budgetItems);
    const to = plainBudgetItems(input.budgetItems);
    if (!sameValue(from, to)) {
      changes.budgetItems = { from, to };
      changes.budget = { from: kpi.budget, to: sumBudgetItems(to) };
    }
  }

  if (input.note !== undefined && (input.note || "") !== (kpi.note || "")) {
    changes.note = { from: kpi.note ?? "", to: input.note };
  }

  if (input.extraItems !== undefined) {
    const from = plainItems(kpi.extraItems);
    const to = plainItems(input.extraItems as IKpiExtraItem[]);
    if (!sameValue(from, to)) changes.extraItems = { from, to };
  }

  return changes;
};

/* --------------------------------- create -------------------------------- */

const createKpi = async (input: CreateKpiInput, token: JwtPayload) => {
  const actor = toActor(token);

  if (input.type === KPI_TYPE.TEAM) {
    if (!isAdmin(actor.role)) {
      throw new AppError(httpStatus.FORBIDDEN, "Only an admin can create the team KPI.");
    }
    if (input.user) {
      throw new AppError(httpStatus.BAD_REQUEST, "A team KPI cannot have a user.");
    }
  } else {
    if (!isAdmin(actor.role) && !isMarketingSalesLead(actor.role)) {
      throw new AppError(httpStatus.FORBIDDEN, "You do not have permission to create KPIs.");
    }
    if (!input.user) {
      throw new AppError(httpStatus.BAD_REQUEST, "User is required for an individual KPI.");
    }
    await assertEligibleUser(input.user);
    if (!isAdmin(actor.role)) await assertLeadMayManage(input.user, actor.userId);
  }

  let kpi: KpiDoc;
  try {
    kpi = await Kpi.create({
      type: input.type,
      month: input.month,
      user: input.type === KPI_TYPE.INDIVIDUAL ? oid(input.user as string) : undefined,
      targetSales: input.targetSales,
      targetProjects: input.targetProjects,
      budgetItems: input.budgetItems,
      extraItems: input.extraItems,
      status: input.status ?? KPI_STATUS.DRAFT,
      note: input.note,
      createdBy: oid(actor.userId),
    });
  } catch (error) {
    return rethrowDuplicate(error);
  }

  await populateKpi(kpi);
  return { data: present(kpi, actor) };
};

/* --------------------------------- update -------------------------------- */

const updateKpi = async (id: string, input: UpdateKpiInput, token: JwtPayload) => {
  const actor = toActor(token);

  if (Object.keys(input).length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, "Nothing to update.");
  }

  // Only an admin can edit a KPI (the lead can create but not edit)
  if (!isAdmin(actor.role)) {
    throw new AppError(httpStatus.FORBIDDEN, "Only an admin can edit a KPI.");
  }

  const kpi = await getKpiOrThrow(id);

  const changes = diffUpdate(kpi, input);

  // Nothing really changed: return the KPI as it is
  if (Object.keys(changes).length === 0) {
    await populateKpi(kpi);
    return { data: present(kpi, actor) };
  }

  if (input.targetSales !== undefined) kpi.targetSales = input.targetSales;
  if (input.targetProjects !== undefined) kpi.targetProjects = input.targetProjects;
  // The model recalculates the total budget from the items on save
  if (input.budgetItems !== undefined) kpi.budgetItems = input.budgetItems;
  if (input.note !== undefined) kpi.note = input.note;
  if (input.extraItems !== undefined) kpi.extraItems = input.extraItems as IKpiExtraItem[];

  kpi.changeLog.push({ by: oid(actor.userId), at: new Date(), changes });
  await kpi.save();

  await populateKpi(kpi);
  return { data: present(kpi, actor) };
};

/** Admin only. Removes the KPI together with its monthly report, if any. */
const deleteKpi = async (id: string, token: JwtPayload) => {
  const actor = toActor(token);

  if (!isAdmin(actor.role)) {
    throw new AppError(httpStatus.FORBIDDEN, "Only an admin can delete a KPI.");
  }

  const kpi = await getKpiOrThrow(id);

  await KpiReport.deleteMany({ kpi: kpi._id });
  await kpi.deleteOne();
};

/** draft -> active -> closed. Nothing moves backwards. */
const updateKpiStatus = async (id: string, status: string, token: JwtPayload) => {
  const actor = toActor(token);

  const kpi = await getKpiOrThrow(id);
  await assertCanWrite(kpi, actor);

  if (KPI_STATUS_FLOW[kpi.status] !== status) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `A ${kpi.status} KPI cannot move to ${status}.`,
    );
  }

  const from = kpi.status;
  kpi.status = status as IKpi["status"];
  kpi.changeLog.push({
    by: oid(actor.userId),
    at: new Date(),
    changes: { status: { from, to: status } },
  });
  await kpi.save();

  await populateKpi(kpi);
  return { data: present(kpi, actor) };
};

/* ---------------------------------- reads -------------------------------- */

const getKpis = async (query: ListKpiQuery, token: JwtPayload) => {
  const actor = toActor(token);
  const scope = readScope(actor);

  // A member can only ask for their own KPIs
  if (
    query.userId &&
    !isAdmin(actor.role) &&
    !isMarketingSalesLead(actor.role) &&
    query.userId !== actor.userId
  ) {
    throw new AppError(httpStatus.FORBIDDEN, "You can only view your own KPI.");
  }

  const filters: QueryFilter<IKpi> = {};
  if (query.month) filters.month = query.month;
  if (query.type) filters.type = query.type;
  if (query.status) filters.status = query.status;
  if (query.userId) filters.user = oid(query.userId);

  const filter: QueryFilter<IKpi> = { $and: [scope, filters] };

  const skip = (query.page - 1) * query.limit;

  const [rows, total] = await Promise.all([
    Kpi.find(filter)
      .sort({ month: -1, type: 1, createdAt: -1 })
      .skip(skip)
      .limit(query.limit)
      .populate([USER_POPULATE, CREATOR_POPULATE, CHANGELOG_POPULATE]),
    Kpi.countDocuments(filter),
  ]);

  return {
    data: rows.map((row) => present(row, actor)),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPage: Math.ceil(total / query.limit),
    },
  };
};

/** The caller's own individual KPI and the team KPI of the month. */
const getMyKpis = async (month: string | undefined, token: JwtPayload) => {
  const actor = toActor(token);
  const targetMonth = month ?? currentMonth();
  const admin = isAdmin(actor.role);

  const [individual, team] = await Promise.all([
    isMarketingSalesTeam(actor.role)
      ? Kpi.findOne({
          type: KPI_TYPE.INDIVIDUAL,
          month: targetMonth,
          user: oid(actor.userId),
          // The lead can see own drafts like any other individual KPI; members cannot
          ...(isMarketingSalesLead(actor.role)
            ? {}
            : { status: { $in: KPI_READER_VISIBLE_STATUSES } }),
        }).populate([USER_POPULATE, CREATOR_POPULATE, CHANGELOG_POPULATE])
      : null,
    Kpi.findOne({
      type: KPI_TYPE.TEAM,
      month: targetMonth,
      ...(admin ? {} : { status: { $in: KPI_READER_VISIBLE_STATUSES } }),
    }).populate([CREATOR_POPULATE, CHANGELOG_POPULATE]),
  ]);

  return {
    data: {
      month: targetMonth,
      individual: present(individual, actor),
      team: present(team, actor),
    },
  };
};

/** Admin view: the team KPI plus the sum of every individual target of the month. */
const getTeamContext = async (month: string | undefined, token: JwtPayload) => {
  const actor = toActor(token);
  const targetMonth = month ?? currentMonth();

  const [team, [sums]] = await Promise.all([
    Kpi.findOne({ type: KPI_TYPE.TEAM, month: targetMonth }).populate([
      CREATOR_POPULATE,
      CHANGELOG_POPULATE,
    ]),
    Kpi.aggregate([
      { $match: { type: KPI_TYPE.INDIVIDUAL, month: targetMonth } },
      {
        $group: {
          _id: null,
          targetSales: { $sum: "$targetSales" },
          targetProjects: { $sum: "$targetProjects" },
          budget: { $sum: "$budget" },
          count: { $sum: 1 },
        },
      },
    ]) as Promise<
      Array<{ targetSales: number; targetProjects: number; budget: number; count: number }>
    >,
  ]);

  return {
    data: {
      month: targetMonth,
      team: present(team, actor),
      sumOfIndividualTargets: {
        targetSales: sums?.targetSales ?? 0,
        targetProjects: sums?.targetProjects ?? 0,
        budget: sums?.budget ?? 0,
        individualCount: sums?.count ?? 0,
      },
    },
  };
};

/** Users that can get an individual KPI (for select inputs). */
const getTeamMembers = async () => {
  const users = await User.find({
    isDeleted: false,
    status: UserStatus.ACTIVE,
    role: { $in: [Role.SALES_MARKETING, Role.MARKETING_SALES_LEAD] },
  })
    .select("firstName lastName email role designation")
    .sort({ firstName: 1, lastName: 1 })
    .lean();

  // Single source of truth for "who is on the team"
  return { data: users.filter((u) => isMarketingSalesTeam(u.role)) };
};

export const KpiServices = {
  createKpi,
  updateKpi,
  deleteKpi,
  updateKpiStatus,
  getKpis,
  getMyKpis,
  getTeamContext,
  getTeamMembers,
};
