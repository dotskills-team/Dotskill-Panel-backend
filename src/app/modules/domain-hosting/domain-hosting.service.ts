/* eslint-disable @typescript-eslint/no-explicit-any */
import httpStatus from "http-status-codes";
import mongoose, { Model, Types } from "mongoose";
import { addDays, endOfDay, startOfDay } from "date-fns";

import AppError from "../../errorHelpers/appError";
import { Client } from "../clients/client.model";
import { Project } from "../project/project.model";
import {
  BillingCycle,
  CREDENTIAL_ROLES,
  DEFAULT_CURRENCY,
  EXPIRING_SOON_DAYS,
  HostingType,
  PaidBy,
  RenewalAction,
  RenewalStatus,
  TargetType,
} from "./domain-hosting.constant";
import {
  AddLogInput,
  CreateDomainInput,
  CreateHostingInput,
  RenewInput,
  UpdateDomainInput,
  UpdateHostingInput,
} from "./domain-hosting.validation";
import { IDomainCredentials, IHostingCredential } from "./domain-hosting.interface";
import { Domain } from "./domain.model";
import { Hosting } from "./hosting.model";
import { RenewalLog } from "./renewal-log.model";
import { CredentialAuditLog } from "./credential-audit-log.model";
import { ReminderNotification } from "./reminder-notification.model";
import {
  decryptSecret,
  encryptSecret,
  MASKED_PASSWORD,
} from "../../utils/credentialCrypto";
import { getDaysLeft } from "./domain-hosting.utils";

/** The logged-in user, taken from the access token. */
export interface DomainHostingActor {
  userId: string;
  role: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/** Converts a validated 24-character hex string into a Mongo ObjectId. */
const toId = (value: string) => new Types.ObjectId(value);

const assertObjectId = (value: string, label = "ID") => {
  if (!OBJECT_ID_PATTERN.test(value)) {
    throw new AppError(httpStatus.BAD_REQUEST, `Invalid ${label}`);
  }
};

const getModel = (type: TargetType): Model<any> =>
  type === TargetType.DOMAIN ? Domain : Hosting;

const canSeeCredentials = (role: string) => CREDENTIAL_ROLES.includes(role);

const toDate = (value?: string | null): Date | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return new Date(value);
};

/** Drops keys whose value is undefined so they never overwrite stored data. */
const withoutUndefined = <T extends Record<string, unknown>>(input: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * Status is derived from the expiry date, except that cancelled items stay cancelled
 * and an explicitly renewed item stays "renewed" until it enters the 30-day window.
 */
export const deriveStatus = (
  current: RenewalStatus,
  expiryDate: Date,
  now: Date = new Date(),
): RenewalStatus => {
  if (current === RenewalStatus.CANCELLED) return RenewalStatus.CANCELLED;

  const daysLeft = getDaysLeft(expiryDate, now);

  if (daysLeft < 0) return RenewalStatus.EXPIRED;
  if (daysLeft <= EXPIRING_SOON_DAYS) return RenewalStatus.EXPIRING_SOON;
  if (current === RenewalStatus.RENEWED) return RenewalStatus.RENEWED;

  return RenewalStatus.ACTIVE;
};

/** Looks up the project and returns its client id and a client name snapshot. */
const resolveProject = async (projectId: string) => {
  const project = await Project.findOne({ _id: projectId, isDeleted: false })
    .select("client")
    .lean();

  if (!project) {
    throw new AppError(httpStatus.NOT_FOUND, "Project not found");
  }

  const client = project.client
    ? await Client.findById(project.client).select("firstName lastName companyName").lean()
    : null;

  const clientName = client
    ? (client.companyName?.trim() ||
        [client.firstName, client.lastName].filter(Boolean).join(" ").trim())
    : "";

  return { clientId: project.client ?? null, clientName };
};

/** Makes sure every linked domain exists and is not deleted. */
const assertLinkedDomains = async (ids: string[] = []) => {
  if (ids.length === 0) return;

  const count = await Domain.countDocuments({ _id: { $in: ids }, isDeleted: false });
  if (count !== new Set(ids).size) {
    throw new AppError(httpStatus.BAD_REQUEST, "One or more linked domains were not found");
  }
};

/* -------------------------------------------------------------------------- */
/* Credential building (encryption happens here, never in the response path)  */
/* -------------------------------------------------------------------------- */

type DomainCredentialsInput = NonNullable<CreateDomainInput["credentials"]>;
type HostingCredentialInput = NonNullable<CreateHostingInput["credentials"]>[number];

/**
 * Builds the stored domain credentials.
 * - password undefined → keep the stored (encrypted) password
 * - password ""        → clear it
 * - any other string   → encrypt and store it
 */
const buildDomainCredentials = (
  input: DomainCredentialsInput | undefined,
  existing?: IDomainCredentials,
): IDomainCredentials => {
  let passwordEncrypted = existing?.passwordEncrypted ?? null;

  if (input?.password !== undefined) {
    passwordEncrypted = input.password === "" ? null : encryptSecret(input.password);
  }

  return {
    loginUrl: input?.loginUrl ?? existing?.loginUrl ?? "",
    username: input?.username ?? existing?.username ?? "",
    twoFactorNote: input?.twoFactorNote ?? existing?.twoFactorNote ?? "",
    passwordEncrypted,
  };
};

/**
 * Builds the stored hosting credential rows. Rows with an existing _id keep their
 * stored password when no new password is sent. Rows not sent are removed.
 */
const buildHostingCredentials = (
  input: HostingCredentialInput[],
  existing: IHostingCredential[] = [],
): IHostingCredential[] =>
  input.map((row) => {
    const previous = row._id
      ? existing.find((item) => String(item._id) === row._id)
      : undefined;

    let passwordEncrypted = previous?.passwordEncrypted ?? null;

    if (row.password !== undefined) {
      passwordEncrypted = row.password === "" ? null : encryptSecret(row.password);
    }

    return {
      _id: previous?._id ?? new Types.ObjectId(),
      label: row.label,
      loginUrl: row.loginUrl ?? "",
      username: row.username ?? "",
      port: row.port ?? null,
      note: row.note ?? "",
      passwordEncrypted,
    };
  });

/* -------------------------------------------------------------------------- */
/* Response mapping (passwords are never returned in clear text)              */
/* -------------------------------------------------------------------------- */

const withDerivedFields = (doc: any) => ({
  ...doc,
  daysLeft: getDaysLeft(doc.expiryDate),
});

/** Domain response. Credentials are masked for admins and removed for everyone else. */
const toPublicDomain = (doc: any, role: string) => {
  const { credentials, ...rest } = doc;
  const base = withDerivedFields(rest);

  if (!canSeeCredentials(role)) return base;

  const { passwordEncrypted, ...fields } = credentials ?? {};

  return {
    ...base,
    credentials: {
      ...fields,
      hasPassword: Boolean(passwordEncrypted),
      password: passwordEncrypted ? MASKED_PASSWORD : "",
    },
  };
};

/** Hosting response. Each credential row gets a masked password instead of the stored one. */
const toPublicHosting = (doc: any, role: string) => {
  const { credentials, ...rest } = doc;
  const base = withDerivedFields(rest);

  if (!canSeeCredentials(role)) return base;

  return {
    ...base,
    credentials: (credentials ?? []).map(({ passwordEncrypted, ...row }: any) => ({
      ...row,
      hasPassword: Boolean(passwordEncrypted),
      password: passwordEncrypted ? MASKED_PASSWORD : "",
    })),
  };
};

const toPublicTarget = (type: TargetType, doc: any, role: string) =>
  type === TargetType.DOMAIN ? toPublicDomain(doc, role) : toPublicHosting(doc, role);

/* -------------------------------------------------------------------------- */
/* List / detail                                                              */
/* -------------------------------------------------------------------------- */

const SORTABLE_FIELDS = ["expiryDate", "createdAt", "clientName", "status"];

const buildSort = (sort?: string): Record<string, 1 | -1> => {
  const raw = sort || "expiryDate";
  const field = raw.replace(/^-/, "");
  const direction = raw.startsWith("-") ? -1 : 1;

  // Nearest expiry first by default
  if (!SORTABLE_FIELDS.includes(field)) return { expiryDate: 1 };

  return { [field]: direction, _id: 1 };
};

const parseDateParam = (value: string): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildListFilter = (type: TargetType, query: Record<string, unknown>) => {
  const filter: Record<string, any> = { isDeleted: false };

  const status = str(query.status);
  if (Object.values(RenewalStatus).includes(status as RenewalStatus)) {
    filter.status = status;
  }

  const provider = str(query.provider);
  if (provider) {
    // Domains filter by registrar, hosting by provider
    filter[type === TargetType.DOMAIN ? "registrar" : "provider"] = {
      $regex: escapeRegex(provider),
      $options: "i",
    };
  }

  const project = str(query.project);
  if (OBJECT_ID_PATTERN.test(project)) filter.project = project;

  const client = str(query.client);
  if (OBJECT_ID_PATTERN.test(client)) filter.client = client;

  const expiryFrom = parseDateParam(str(query.expiryFrom));
  const expiryTo = parseDateParam(str(query.expiryTo));
  if (expiryFrom || expiryTo) {
    const range: Record<string, Date> = {};
    if (expiryFrom) range.$gte = startOfDay(expiryFrom);
    if (expiryTo) range.$lte = endOfDay(expiryTo);
    filter.expiryDate = range;
  }

  const term = str(query.searchTerm);
  if (term) {
    const regex = { $regex: escapeRegex(term), $options: "i" };
    const fields =
      type === TargetType.DOMAIN
        ? ["domainName", "clientName", "registrar"]
        : ["provider", "planName", "clientName", "serverIp"];
    filter.$or = fields.map((field) => ({ [field]: regex }));
  }

  return filter;
};

const listTargets = async (
  type: TargetType,
  query: Record<string, unknown>,
  actor: DomainHostingActor,
) => {
  const Target = getModel(type);
  const filter = buildListFilter(type, query);

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));

  let listQuery = Target.find(filter)
    .sort(buildSort(str(query.sort)))
    .skip((page - 1) * limit)
    .limit(limit);

  if (type === TargetType.HOSTING) {
    listQuery = listQuery.populate("linkedDomains", "domainName status expiryDate");
  }

  const [docs, total] = await Promise.all([
    listQuery.lean(),
    Target.countDocuments(filter),
  ]);

  return {
    result: docs.map((doc: any) => toPublicTarget(type, doc, actor.role)),
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
  };
};

const getTargetById = async (type: TargetType, id: string, actor: DomainHostingActor) => {
  assertObjectId(id);

  const Target = getModel(type);
  let query = Target.findOne({ _id: id, isDeleted: false });

  if (type === TargetType.HOSTING) {
    query = query.populate("linkedDomains", "domainName status expiryDate");
  }

  const doc = await query.lean();
  if (!doc) {
    throw new AppError(httpStatus.NOT_FOUND, "Record not found");
  }

  return toPublicTarget(type, doc, actor.role);
};

/* -------------------------------------------------------------------------- */
/* Domain CRUD                                                                */
/* -------------------------------------------------------------------------- */

const createDomain = async (payload: CreateDomainInput, actor: DomainHostingActor) => {
  const { clientId, clientName } = await resolveProject(payload.project);

  const expiryDate = new Date(payload.expiryDate);

  const doc = await Domain.create({
    project: toId(payload.project),
    client: clientId,
    clientName,
    domainName: payload.domainName,
    registrar: payload.registrar ?? "",
    registrarUrl: payload.registrarUrl ?? "",
    purchaseDate: toDate(payload.purchaseDate) ?? null,
    expiryDate,
    purchasePrice: payload.purchasePrice ?? 0,
    renewalPrice: payload.renewalPrice ?? 0,
    currency: payload.currency ?? DEFAULT_CURRENCY,
    paidBy: payload.paidBy ?? PaidBy.COMPANY,
    autoRenew: payload.autoRenew ?? false,
    nameservers: payload.nameservers ?? [],
    dnsNotes: payload.dnsNotes ?? "",
    whoisPrivacy: payload.whoisPrivacy ?? false,
    credentials: buildDomainCredentials(payload.credentials),
    status: deriveStatus(payload.status ?? RenewalStatus.ACTIVE, expiryDate),
    notes: payload.notes ?? "",
    createdBy: toId(actor.userId),
    updatedBy: toId(actor.userId),
  });

  return toPublicDomain(doc.toObject(), actor.role);
};

const updateDomain = async (id: string, payload: UpdateDomainInput, actor: DomainHostingActor) => {
  assertObjectId(id);

  const existing = await Domain.findOne({ _id: id, isDeleted: false }).lean();
  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, "Domain not found");
  }

  const { credentials, project, purchaseDate, expiryDate, ...fields } = payload;

  const $set: Record<string, unknown> = {
    ...withoutUndefined(fields as Record<string, unknown>),
    updatedBy: toId(actor.userId),
  };

  if (project) {
    const { clientId, clientName } = await resolveProject(project);
    $set.project = project;
    $set.client = clientId;
    $set.clientName = clientName;
  }

  if (purchaseDate !== undefined) {
    $set.purchaseDate = toDate(purchaseDate);
  }

  const nextExpiry = expiryDate !== undefined ? new Date(expiryDate) : existing.expiryDate;
  if (expiryDate !== undefined) {
    $set.expiryDate = nextExpiry;
  }

  if (credentials) {
    $set.credentials = buildDomainCredentials(credentials, existing.credentials);
  }

  $set.status = deriveStatus(payload.status ?? existing.status, nextExpiry);

  const updated = await Domain.findByIdAndUpdate(id, { $set }, { new: true, runValidators: true }).lean();

  return toPublicDomain(updated, actor.role);
};

/* -------------------------------------------------------------------------- */
/* Hosting CRUD                                                               */
/* -------------------------------------------------------------------------- */

const createHosting = async (payload: CreateHostingInput, actor: DomainHostingActor) => {
  const { clientId, clientName } = await resolveProject(payload.project);
  await assertLinkedDomains(payload.linkedDomains);

  const expiryDate = new Date(payload.expiryDate);

  const doc = await Hosting.create({
    project: toId(payload.project),
    client: clientId,
    clientName,
    linkedDomains: (payload.linkedDomains ?? []).map(toId),
    hostingType: payload.hostingType ?? HostingType.SHARED,
    provider: payload.provider ?? "",
    planName: payload.planName ?? "",
    serverLocation: payload.serverLocation ?? "",
    serverIp: payload.serverIp ?? "",
    controlPanel: payload.controlPanel ?? "",
    controlPanelUrl: payload.controlPanelUrl ?? "",
    purchaseDate: toDate(payload.purchaseDate) ?? null,
    expiryDate,
    billingCycle: payload.billingCycle ?? BillingCycle.YEARLY,
    purchasePrice: payload.purchasePrice ?? 0,
    renewalPrice: payload.renewalPrice ?? 0,
    currency: payload.currency ?? DEFAULT_CURRENCY,
    paidBy: payload.paidBy ?? PaidBy.COMPANY,
    credentials: buildHostingCredentials(payload.credentials ?? []),
    status: deriveStatus(payload.status ?? RenewalStatus.ACTIVE, expiryDate),
    notes: payload.notes ?? "",
    createdBy: toId(actor.userId),
    updatedBy: toId(actor.userId),
  });

  return toPublicHosting(doc.toObject(), actor.role);
};

const updateHosting = async (id: string, payload: UpdateHostingInput, actor: DomainHostingActor) => {
  assertObjectId(id);

  const existing = await Hosting.findOne({ _id: id, isDeleted: false }).lean();
  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, "Hosting record not found");
  }

  const { credentials, project, purchaseDate, expiryDate, linkedDomains, ...fields } = payload;

  const $set: Record<string, unknown> = {
    ...withoutUndefined(fields as Record<string, unknown>),
    updatedBy: toId(actor.userId),
  };

  if (project) {
    const { clientId, clientName } = await resolveProject(project);
    $set.project = project;
    $set.client = clientId;
    $set.clientName = clientName;
  }

  if (linkedDomains !== undefined) {
    await assertLinkedDomains(linkedDomains);
    $set.linkedDomains = linkedDomains;
  }

  if (purchaseDate !== undefined) {
    $set.purchaseDate = toDate(purchaseDate);
  }

  const nextExpiry = expiryDate !== undefined ? new Date(expiryDate) : existing.expiryDate;
  if (expiryDate !== undefined) {
    $set.expiryDate = nextExpiry;
  }

  if (credentials) {
    $set.credentials = buildHostingCredentials(credentials, existing.credentials);
  }

  $set.status = deriveStatus(payload.status ?? existing.status, nextExpiry);

  const updated = await Hosting.findByIdAndUpdate(id, { $set }, { new: true, runValidators: true })
    .populate("linkedDomains", "domainName status expiryDate")
    .lean();

  return toPublicHosting(updated, actor.role);
};

/* -------------------------------------------------------------------------- */
/* Soft delete (shared)                                                       */
/* -------------------------------------------------------------------------- */

const softDeleteTarget = async (type: TargetType, id: string, actor: DomainHostingActor) => {
  assertObjectId(id);

  const result = await getModel(type).updateOne(
    { _id: id, isDeleted: false },
    { $set: { isDeleted: true, updatedBy: actor.userId } },
  );

  if (result.matchedCount === 0) {
    throw new AppError(httpStatus.NOT_FOUND, "Record not found");
  }
};

/* -------------------------------------------------------------------------- */
/* Renewal and contact logs                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Extends the expiry date, sets the status, stores the amount paid and writes a
 * renewal log entry. Both writes happen in one transaction.
 */
const renewTarget = async (
  type: TargetType,
  id: string,
  payload: RenewInput,
  actor: DomainHostingActor,
) => {
  assertObjectId(id);

  const Target = getModel(type);
  const existing = await Target.findOne({ _id: id, isDeleted: false }).lean();

  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, "Record not found");
  }

  if (existing.status === RenewalStatus.CANCELLED) {
    throw new AppError(httpStatus.BAD_REQUEST, "A cancelled item cannot be renewed");
  }

  const newExpiry = new Date(payload.newExpiryDate);
  if (newExpiry <= new Date(existing.expiryDate)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "New expiry date must be after the current expiry date",
    );
  }

  const nextStatus = deriveStatus(payload.status ?? RenewalStatus.RENEWED, newExpiry);
  const amountPaid = payload.amountPaid ?? 0;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Target.updateOne(
        { _id: id },
        {
          $set: {
            expiryDate: newExpiry,
            status: nextStatus,
            lastRenewedAt: new Date(),
            lastPaidAmount: amountPaid,
            updatedBy: toId(actor.userId),
          },
        },
        { session },
      );

      await RenewalLog.create(
        [
          {
            targetType: type,
            targetId: toId(id),
            action: RenewalAction.RENEWED,
            contactMethod: payload.contactMethod ?? null,
            oldExpiryDate: existing.expiryDate,
            newExpiryDate: newExpiry,
            amountPaid,
            note: payload.note ?? "",
            createdBy: toId(actor.userId),
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  return getTargetById(type, id, actor);
};

const ensureTargetExists = async (type: TargetType, id: string) => {
  assertObjectId(id);

  const exists = await getModel(type).exists({ _id: id, isDeleted: false });
  if (!exists) {
    throw new AppError(httpStatus.NOT_FOUND, "Record not found");
  }
};

const addLog = async (
  type: TargetType,
  id: string,
  payload: AddLogInput,
  actor: DomainHostingActor,
) => {
  await ensureTargetExists(type, id);

  const log = await RenewalLog.create({
    targetType: type,
    targetId: toId(id),
    action: payload.action as RenewalAction,
    contactMethod: payload.contactMethod ?? null,
    note: payload.note ?? "",
    createdBy: toId(actor.userId),
  });

  return log.toObject();
};

const getLogs = async (type: TargetType, id: string) => {
  assertObjectId(id);

  return RenewalLog.find({ targetType: type, targetId: id })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("createdBy", "fullName email")
    .lean();
};

/* -------------------------------------------------------------------------- */
/* Credential reveal (audited)                                                */
/* -------------------------------------------------------------------------- */

/**
 * Decrypts one stored password and writes an audit entry first.
 * If the audit entry cannot be written, the password is not returned.
 */
const revealCredential = async (
  type: TargetType,
  id: string,
  credentialId: string | undefined,
  actor: DomainHostingActor,
  ipAddress: string,
) => {
  assertObjectId(id);

  if (!canSeeCredentials(actor.role)) {
    throw new AppError(httpStatus.FORBIDDEN, "You are not allowed to reveal credentials");
  }

  const doc: any = await getModel(type).findOne({ _id: id, isDeleted: false }).lean();
  if (!doc) {
    throw new AppError(httpStatus.NOT_FOUND, "Record not found");
  }

  let encrypted: any = null;
  let resolvedCredentialId: Types.ObjectId | null = null;

  if (type === TargetType.DOMAIN) {
    encrypted = doc.credentials?.passwordEncrypted ?? null;
  } else {
    if (!credentialId) {
      throw new AppError(httpStatus.BAD_REQUEST, "credentialId is required for hosting credentials");
    }
    assertObjectId(credentialId, "credential ID");

    const row = (doc.credentials ?? []).find(
      (item: any) => String(item._id) === credentialId,
    );
    if (!row) {
      throw new AppError(httpStatus.NOT_FOUND, "Credential not found");
    }

    encrypted = row.passwordEncrypted ?? null;
    resolvedCredentialId = row._id;
  }

  if (!encrypted) {
    throw new AppError(httpStatus.NOT_FOUND, "No password is stored for this credential");
  }

  // Audit first: if this write fails, the password is not returned
  await CredentialAuditLog.create({
    userId: toId(actor.userId),
    role: actor.role,
    action: "reveal",
    targetType: type,
    targetId: toId(id),
    credentialId: resolvedCredentialId,
    ipAddress,
  });

  return { password: decryptSecret(encrypted) };
};

/* -------------------------------------------------------------------------- */
/* Dashboard summary                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Counts for the overview cards. The "expiring within N days" counts are cumulative:
 * within 15 days includes everything within 7 days.
 */
const getDashboardSummary = async () => {
  const today = startOfDay(new Date());
  const windowEnd = (days: number) => endOfDay(addDays(today, days));

  const liveFilter = { isDeleted: false, status: { $ne: RenewalStatus.CANCELLED } };

  const countsFor = async (Target: Model<any>) => {
    const [expired, within7, within15, within30, totalActive, costRows] = await Promise.all([
      Target.countDocuments({ ...liveFilter, expiryDate: { $lt: today } }),
      Target.countDocuments({ ...liveFilter, expiryDate: { $gte: today, $lte: windowEnd(7) } }),
      Target.countDocuments({ ...liveFilter, expiryDate: { $gte: today, $lte: windowEnd(15) } }),
      Target.countDocuments({ ...liveFilter, expiryDate: { $gte: today, $lte: windowEnd(30) } }),
      Target.countDocuments({ ...liveFilter, expiryDate: { $gte: today } }),
      Target.aggregate([
        {
          $match: {
            ...liveFilter,
            expiryDate: { $gte: today, $lte: windowEnd(EXPIRING_SOON_DAYS) },
          },
        },
        { $group: { _id: "$currency", total: { $sum: "$renewalPrice" } } },
      ]),
    ]);

    return { expired, within7, within15, within30, totalActive, costRows };
  };

  const [domains, hosting] = await Promise.all([countsFor(Domain), countsFor(Hosting)]);

  // Costs are summed per currency, never across currencies
  const upcomingRenewalCost: Record<string, number> = {};
  [...domains.costRows, ...hosting.costRows].forEach((row: any) => {
    const currency = row._id || DEFAULT_CURRENCY;
    upcomingRenewalCost[currency] = (upcomingRenewalCost[currency] ?? 0) + row.total;
  });

  return {
    expired: domains.expired + hosting.expired,
    expiringWithin7Days: domains.within7 + hosting.within7,
    expiringWithin15Days: domains.within15 + hosting.within15,
    expiringWithin30Days: domains.within30 + hosting.within30,
    totalActive: domains.totalActive + hosting.totalActive,
    upcomingRenewalCost,
  };
};

/* -------------------------------------------------------------------------- */
/* In-app reminder notifications                                              */
/* -------------------------------------------------------------------------- */

const getNotifications = async (actor: DomainHostingActor) => {
  const [docs, unreadCount] = await Promise.all([
    ReminderNotification.find({ audience: actor.role })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    ReminderNotification.countDocuments({
      audience: actor.role,
      readBy: { $ne: actor.userId },
    }),
  ]);

  const items = docs.map((doc) => ({
    _id: doc._id,
    targetType: doc.targetType,
    targetId: doc.targetId,
    subjectName: doc.subjectName,
    clientName: doc.clientName,
    expiryDate: doc.expiryDate,
    daysBefore: doc.daysBefore,
    title: doc.title,
    message: doc.message,
    createdAt: doc.createdAt,
    isRead: doc.readBy.some((userId) => String(userId) === actor.userId),
  }));

  return { items, unreadCount };
};

const markNotificationRead = async (id: string, actor: DomainHostingActor) => {
  assertObjectId(id);

  const result = await ReminderNotification.updateOne(
    { _id: id, audience: actor.role },
    { $addToSet: { readBy: actor.userId } },
  );

  if (result.matchedCount === 0) {
    throw new AppError(httpStatus.NOT_FOUND, "Notification not found");
  }
};

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

export const DomainHostingService = {
  listTargets,
  getTargetById,
  createDomain,
  updateDomain,
  createHosting,
  updateHosting,
  softDeleteTarget,
  renewTarget,
  addLog,
  getLogs,
  revealCredential,
  getDashboardSummary,
  getNotifications,
  markNotificationRead,
};
