import httpStatus from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";
import { Types } from "mongoose";

import AppError from "../../errorHelpers/appError";
import { QueryBuilder } from "../../utils/QueryBuilder";

import { Client } from "./client.model";
import { ClientStatus, IClient } from "./client.interface";
import { clientSearchableFields } from "./client.constant";

import { User } from "../user/user.model";
import { Role, UserStatus } from "../user/user.interface";
import { isMarketingSalesTeam } from "../../utils/roleHelpers";
import {
  CLIENT_VALUE_FIELDS,
  projectValueSelectFor,
  sanitizeClientForRole,
  sanitizeClientsForRole,
  sanitizeClientStatsForRole,
  stripValueQueryForRole,
} from "../../utils/projectValue";
import { ClientNote } from "./clientNote/clientNote.model";
import { ClientDocument } from "./clientDocument/clientDocument.model";
import { ClientDocumentType } from "./clientDocument/clientDocument.interface";
import { Project } from "../project/project.model";

const PROTECTED_FIELDS: (keyof IClient | string)[] = [
  "_id",

  "leadId",
  "clientCode",

  "createdBy",
  "updatedBy",

  // Changed only through the dedicated credited-to rules below
  "creditedTo",

  "deletedBy",
  "deletedAt",
  "isDeleted",

  "createdAt",
  "updatedAt",

  "projects",
  "totalProjects",
  "completedProjects",
  "activeProjects",

  "totalRevenue",
  "totalInvoices",
  "totalPaid",
  "totalDue",
];

const stripProtectedFields = <T extends Record<string, any>>(
  payload: T,
): Partial<T> => {
  const sanitized: Record<string, any> = { ...payload };

  PROTECTED_FIELDS.forEach((field) => {
    delete sanitized[field as string];
  });

  return sanitized as Partial<T>;
};

const toObjectId = (id: string) => new Types.ObjectId(id);

const assertValidObjectId = (id: string, label = "Client id") => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, `Invalid ${label}.`);
  }
};

const assertClientExists = async (clientId: string): Promise<IClient> => {
  assertValidObjectId(clientId);

  const client = await Client.findOne({
    _id: clientId,
    isDeleted: false,
  });

  if (!client) {
    throw new AppError(httpStatus.NOT_FOUND, "Client not found.");
  }

  return client;
};

const assertManagerExists = async (userId: string) => {
  assertValidObjectId(userId, "accountManager id");

  const user = await User.findOne({
    _id: userId,
    isDeleted: false,
    role: {
      $in: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.STAFF],
    },
  });

  if (!user) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "The selected account manager does not exist.",
    );
  }

  return user;
};

// Roles that may set or change "credited to" on a client
const CREDIT_EDIT_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.MARKETING_SALES_LEAD];

const canEditCreditedTo = (role?: string | null): boolean =>
  !!role && CREDIT_EDIT_ROLES.includes(role);

// The credited user must be an active marketing/sales team member
const assertCreditedUserValid = async (userId: string) => {
  assertValidObjectId(userId, "creditedTo id");

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
      "Credited user must be an active marketing/sales team member.",
    );
  }

  return user;
};

// clientId (string) -> projects[] (single query for all given clients)
const getProjectsByClient = async (
  clientIds: (Types.ObjectId | string)[],
  role?: string | null,
): Promise<Map<string, any[]>> => {
  const map = new Map<string, any[]>();

  if (!clientIds.length) return map;

  // Non-admin roles never receive project money (budget, payments, dues)
  const valueSelect = projectValueSelectFor(role);

  let projectQuery = Project.find({
    client: { $in: clientIds.map((id) => new Types.ObjectId(String(id))) },
    isDeleted: { $ne: true },
  });
  if (valueSelect) projectQuery = projectQuery.select(valueSelect);

  const projects = await projectQuery
    .sort({ createdAt: -1 })
    .populate([
      {
        path: "projectManager",
        select: "firstName lastName email designation",
      },
      {
        path: "developers",
        select: "firstName lastName email designation",
      },
    ])
    .lean();

  projects.forEach((project: any) => {
    const key = String(project.client);
    const list = map.get(key);

    if (list) {
      list.push(project);
    } else {
      map.set(key, [project]);
    }
  });

  return map;
};

// Client document er kon field er upor date filter cholbe
const CLIENT_DATE_FIELD = "createdAt";

// "2026-06-18" -> that day 00:00:00.000 to 23:59:59.999 (UTC)
const getDayBoundariesUTC = (dateStr: string) => {
  const d = new Date(dateStr);

  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );

  const end = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );

  return { start, end };
};

// Rules:
// - startDate + endDate -> inclusive range
// - only startDate      -> only that day
// - only endDate        -> only that day
// - none                -> no filter
const buildDateRangeFilter = (
  startDateStr?: string,
  endDateStr?: string,
): { $gte: Date; $lte: Date } | null => {
  if (startDateStr && endDateStr) {
    return {
      $gte: getDayBoundariesUTC(startDateStr).start,
      $lte: getDayBoundariesUTC(endDateStr).end,
    };
  }

  const single = startDateStr || endDateStr;

  if (single) {
    const { start, end } = getDayBoundariesUTC(single);
    return { $gte: start, $lte: end };
  }

  return null;
};

// Extracts startDate/endDate from query, builds the Mongo filter, and removes
// those keys so QueryBuilder doesn't treat them as normal field filters.
const buildDateFilter = (query: Record<string, string>) => {
  const startDateStr = query["startDate"];
  const endDateStr = query["endDate"];

  delete query.startDate;
  delete query.endDate;

  const range = buildDateRangeFilter(startDateStr, endDateStr);

  return range ? { [CLIENT_DATE_FIELD]: range } : {};
};

const sanitizeQuery = (query: Record<string, string>) => {
  const sanitized = { ...query };

  delete sanitized["createdAt[gte]"];
  delete sanitized["createdAt[lte]"];

  return sanitized;
};

const populateOptions = [
  {
    path: "leadId",
    select: "firstName lastName company phone email source status",
  },
  {
    path: "accountManager",
    select: "firstName lastName email designation",
  },
  {
    path: "creditedTo",
    select: "firstName lastName email role",
  },
  {
    path: "createdBy",
    select: "firstName lastName email",
  },
  {
    path: "updatedBy",
    select: "firstName lastName email",
  },
  {
    path: "deletedBy",
    select: "firstName lastName email",
  },
  {
    path: "notes",
    populate: {
      path: "createdBy",
      select: "firstName lastName email",
    },
  },
  {
    path: "documents",
    populate: {
      path: "uploadedBy",
      select: "firstName lastName email",
    },
  },
];

/**
 * Client stats (status counts + project/financial totals)
 */
const getStatusStats = async (filter: Record<string, unknown> = {}) => {
  const [agg] = await Client.aggregate([
    {
      $match: {
        isDeleted: { $ne: true },
        ...filter,
      },
    },
    {
      $facet: {
        byStatus: [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ],
        totals: [
          {
            $group: {
              _id: null,
              totalProjects: { $sum: { $ifNull: ["$totalProjects", 0] } },
              completedProjects: {
                $sum: { $ifNull: ["$completedProjects", 0] },
              },
              activeProjects: { $sum: { $ifNull: ["$activeProjects", 0] } },
              totalRevenue: { $sum: { $ifNull: ["$totalRevenue", 0] } },
              totalInvoices: { $sum: { $ifNull: ["$totalInvoices", 0] } },
              totalPaid: { $sum: { $ifNull: ["$totalPaid", 0] } },
              totalDue: { $sum: { $ifNull: ["$totalDue", 0] } },
            },
          },
        ],
      },
    },
  ]);

  const totals = agg?.totals?.[0] ?? {};

  const result = {
    total: 0,
    Active: 0,
    Inactive: 0,
    Suspended: 0,
    Blacklisted: 0,
    totalProjects: totals.totalProjects ?? 0,
    completedProjects: totals.completedProjects ?? 0,
    activeProjects: totals.activeProjects ?? 0,
    totalRevenue: totals.totalRevenue ?? 0,
    totalInvoices: totals.totalInvoices ?? 0,
    totalPaid: totals.totalPaid ?? 0,
    totalDue: totals.totalDue ?? 0,
  };

  (agg?.byStatus ?? []).forEach((s: { _id: string; count: number }) => {
    switch (s._id) {
      case ClientStatus.ACTIVE:
        result.Active = s.count;
        break;

      case ClientStatus.INACTIVE:
        result.Inactive = s.count;
        break;

      case ClientStatus.SUSPENDED:
        result.Suspended = s.count;
        break;

      case ClientStatus.BLACKLISTED:
        result.Blacklisted = s.count;
        break;
    }

    result.total += s.count;
  });

  return result;
};

const getClients = async (
  query: Record<string, string>,
  decodedToken?: JwtPayload,
) => {
  const role = decodedToken?.role;
  // Non-admin roles cannot filter, sort or project by money rollups
  const cleanQuery = stripValueQueryForRole(
    sanitizeQuery(query),
    role,
    CLIENT_VALUE_FIELDS,
  );
  const dateFilterObj = buildDateFilter(cleanQuery);

  // Default sort: newest first
  if (!cleanQuery.sort) {
    cleanQuery.sort = "-createdAt";
  }

  const baseFilter: Record<string, any> = {
    isDeleted: false,
    ...dateFilterObj,
  };

  const queryBuilder = new QueryBuilder(Client.find(baseFilter), cleanQuery);

  const clientsQuery = queryBuilder
    .filter()
    .search(clientSearchableFields)
    .sort()
    .fields()
    .paginate();

  const [clients, meta, stats] = await Promise.all([
    clientsQuery.build().populate(populateOptions),
    queryBuilder.getMeta(),
    getStatusStats(dateFilterObj),
  ]);

  const projectsByClient = await getProjectsByClient(
    clients.map((c) => c._id as Types.ObjectId),
    role,
  );

  const data = clients.map((client) => ({
    ...client.toObject(),
    projects: projectsByClient.get(String(client._id)) ?? [],
  }));

  return {
    data: sanitizeClientsForRole(data, role),
    meta,
    stats: sanitizeClientStatsForRole(stats, role),
  };
};

const getDeletedClients = async (
  query: Record<string, string>,
  decodedToken?: JwtPayload,
) => {
  const role = decodedToken?.role;
  const cleanQuery = stripValueQueryForRole(
    sanitizeQuery(query),
    role,
    CLIENT_VALUE_FIELDS,
  );
  const dateFilterObj = buildDateFilter(cleanQuery);

  const baseFilter: Record<string, any> = {
    isDeleted: true,
    ...dateFilterObj,
  };

  const queryBuilder = new QueryBuilder(Client.find(baseFilter), cleanQuery);

  const clientsQuery = queryBuilder
    .filter()
    .search(clientSearchableFields)
    .sort()
    .fields()
    .paginate();

  const [data, meta] = await Promise.all([
    clientsQuery.build().populate(populateOptions),
    queryBuilder.getMeta(),
  ]);

  return {
    data: sanitizeClientsForRole(data, role),
    meta,
  };
};

const getClientById = async (clientId: string, decodedToken?: JwtPayload) => {
  assertValidObjectId(clientId);

  const client = await Client.findOne({
    _id: clientId,
    isDeleted: false,
  }).populate(populateOptions);

  if (!client) {
    throw new AppError(httpStatus.NOT_FOUND, "Client not found.");
  }

  return {
    data: sanitizeClientForRole(client, decodedToken?.role),
  };
};

const createClient = async (
  payload: Partial<IClient>,
  decodedToken: JwtPayload,
) => {
  if (payload.accountManager) {
    await assertManagerExists(payload.accountManager as unknown as string);
  }

  const client = await Client.create({
    ...payload,
    createdBy: toObjectId(decodedToken.userId),
    updatedBy: toObjectId(decodedToken.userId),
    // A new client is credited to whoever creates it
    creditedTo: toObjectId(decodedToken.userId),
  });

  const populatedClient = await Client.findById(client._id).populate(
    populateOptions,
  );

  return {
    data: populatedClient,
  };
};

const updateClient = async (
  clientId: string,
  payload: Partial<IClient>,
  decodedToken: JwtPayload,
) => {
  await assertClientExists(clientId);

  if (payload.accountManager) {
    await assertManagerExists(payload.accountManager as unknown as string);
  }

  const sanitizedPayload = stripProtectedFields(payload);

  // creditedTo is stripped above; apply it only for allowed roles
  const creditUpdate: { creditedTo?: Types.ObjectId } = {};
  if (payload.creditedTo !== undefined) {
    if (!canEditCreditedTo(decodedToken.role)) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "You are not allowed to change who a client is credited to.",
      );
    }
    await assertCreditedUserValid(String(payload.creditedTo));
    creditUpdate.creditedTo = toObjectId(String(payload.creditedTo));
  }

  const updatedClient = await Client.findByIdAndUpdate(
    clientId,
    {
      ...sanitizedPayload,
      ...creditUpdate,
      updatedBy: toObjectId(decodedToken.userId),
    },
    {
      new: true,
      runValidators: true,
    },
  ).populate(populateOptions);

  return {
    data: updatedClient,
  };
};

/**
 * Changes only the "credited to" user. Allowed for admins and the
 * marketing & sales lead, who cannot otherwise edit clients.
 */
const updateCreditedTo = async (
  clientId: string,
  creditedTo: string,
  decodedToken: JwtPayload,
) => {
  if (!canEditCreditedTo(decodedToken.role)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not allowed to change who a client is credited to.",
    );
  }

  await assertClientExists(clientId);
  await assertCreditedUserValid(creditedTo);

  const updatedClient = await Client.findByIdAndUpdate(
    clientId,
    {
      creditedTo: toObjectId(creditedTo),
      updatedBy: toObjectId(decodedToken.userId),
    },
    {
      new: true,
      runValidators: true,
    },
  ).populate(populateOptions);

  return {
    data: sanitizeClientForRole(updatedClient, decodedToken.role),
  };
};

/**
 * Users that can be picked in "credited to": active marketing/sales team members.
 * Needed because the lead cannot call the general users list.
 */
const getCreditCandidates = async () => {
  const users = await User.find({
    isDeleted: false,
    status: UserStatus.ACTIVE,
    role: { $in: [Role.SALES_MARKETING, Role.MARKETING_SALES_LEAD] },
  })
    .select("firstName lastName email role")
    .sort({ firstName: 1, lastName: 1 })
    .lean();

  return { data: users };
};

const updateClientStatus = async (
  clientId: string,
  status: ClientStatus,
  decodedToken: JwtPayload,
) => {
  await assertClientExists(clientId);

  const updatedClient = await Client.findByIdAndUpdate(
    clientId,
    {
      status,
      updatedBy: toObjectId(decodedToken.userId),
    },
    {
      new: true,
      runValidators: true,
    },
  ).populate(populateOptions);

  return {
    data: updatedClient,
  };
};

const assignClientManager = async (
  clientId: string,
  managerId: string,
  decodedToken: JwtPayload,
) => {
  await assertClientExists(clientId);
  await assertManagerExists(managerId);

  const updatedClient = await Client.findByIdAndUpdate(
    clientId,
    {
      accountManager: toObjectId(managerId),
      updatedBy: toObjectId(decodedToken.userId),
    },
    {
      new: true,
      runValidators: true,
    },
  ).populate(populateOptions);

  return {
    data: updatedClient,
  };
};

const addNote = async (
  clientId: string,
  message: string,
  decodedToken: JwtPayload,
) => {
  const client = await assertClientExists(clientId);

  const note = await ClientNote.create({
    client: client._id,
    message,
    createdBy: toObjectId(decodedToken.userId),
  });

  await Client.findByIdAndUpdate(clientId, {
    $push: {
      notes: note._id,
    },
    updatedBy: toObjectId(decodedToken.userId),
  });

  const updatedClient =
    await Client.findById(clientId).populate(populateOptions);

  return {
    data: updatedClient,
  };
};

const addDocument = async (
  clientId: string,
  payload: {
    title: string;
    url: string;
    type?: ClientDocumentType;
  },
  decodedToken: JwtPayload,
) => {
  const client = await assertClientExists(clientId);

  const document = await ClientDocument.create({
    client: client._id,
    title: payload.title,
    url: payload.url,
    type: payload.type ?? ClientDocumentType.OTHER,
    uploadedBy: toObjectId(decodedToken.userId),
  });

  await Client.findByIdAndUpdate(clientId, {
    $push: {
      documents: document._id,
    },
    updatedBy: toObjectId(decodedToken.userId),
  });

  const updatedClient =
    await Client.findById(clientId).populate(populateOptions);

  return {
    data: updatedClient,
  };
};

const softDeleteClient = async (clientId: string, decodedToken: JwtPayload) => {
  await assertClientExists(clientId);

  await Client.findByIdAndUpdate(clientId, {
    isDeleted: true,
    deletedAt: new Date(),
    deletedBy: toObjectId(decodedToken.userId),
  });

  return {
    data: null,
  };
};

const restoreClient = async (clientId: string, decodedToken: JwtPayload) => {
  assertValidObjectId(clientId);

  const client = await Client.findOne({
    _id: clientId,
    isDeleted: true,
  });

  if (!client) {
    throw new AppError(httpStatus.NOT_FOUND, "Deleted client not found.");
  }

  const updatedClient = await Client.findByIdAndUpdate(
    clientId,
    {
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      updatedBy: toObjectId(decodedToken.userId),
    },
    {
      new: true,
      runValidators: true,
    },
  ).populate(populateOptions);

  return {
    data: updatedClient,
  };
};

const permanentlyDeleteClient = async (
  clientId: string,
  decodedToken: JwtPayload,
) => {
  if (decodedToken.role !== Role.SUPER_ADMIN) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only a Super Admin can permanently delete a client.",
    );
  }

  assertValidObjectId(clientId);

  const client = await Client.findOne({
    _id: clientId,
    isDeleted: true,
  });

  if (!client) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Only already soft-deleted clients can be permanently deleted.",
    );
  }

  await Promise.all([
    ClientNote.deleteMany({
      client: client._id,
    }),
    ClientDocument.deleteMany({
      client: client._id,
    }),
  ]);

  await Client.findByIdAndDelete(clientId);

  return {
    data: null,
  };
};

export const ClientServices = {
  createClient,

  getClients,
  getDeletedClients,
  getClientById,

  updateClient,
  updateCreditedTo,
  getCreditCandidates,
  updateClientStatus,
  assignClientManager,

  addNote,
  addDocument,

  softDeleteClient,
  restoreClient,
  permanentlyDeleteClient,
};