
import httpStatus from "http-status-codes";
import mongoose, { AnyBulkWriteOperation, Types } from "mongoose";
import { JwtPayload } from "jsonwebtoken";

import { ILead, LeadContactStatus, LeadStatus } from "./lead.interface";
import { Lead } from "./lead.model";
import { leadSearchableFields, MAX_LEAD_IMPORT_ROWS } from "./lead.constants";
import { User } from "../user/user.model";
import { Role } from "../user/user.interface";
import AppError from "../../errorHelpers/appError";
import { QueryBuilder } from "../../utils/QueryBuilder";
import { parseImportFile, validateImportedLead } from "./lead.import.utils";
import { Client } from "../clients/client.model";
import { ClientType } from "../clients/client.interface";
interface IImportSummary {
  total: number;
  imported: number;
  duplicates: number;
  failed: number;
}

interface IPreparedLead {
  rowNumber: number;
  data: Partial<ILead>;
}

const PROTECTED_FIELDS: (keyof ILead | string)[] = [
  "createdBy",
  "updatedBy",
  "deletedBy",
  "deletedAt",
  "isDeleted",
  "isConverted",
  "convertedAt",
  "convertedBy",
  "clientId",
  "attachments",
  "notes",
  "_id",
];

const validateImportFile = (file?: Express.Multer.File) => {
  if (!file) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Please upload a CSV, XLS or XLSX file.",
    );
  }

  const allowedMimeTypes = [
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Unsupported file format. Only CSV, XLS and XLSX files are allowed.",
    );
  }
};

const getDuplicateMaps = async (leads: Partial<ILead>[]) => {
  const phones = leads
    .map((lead) => lead.phone)
    .filter((phone): phone is string => Boolean(phone));

  const emails = leads
    .map((lead) => lead.email)
    .filter((email): email is string => Boolean(email));

  const conditions = [];

  if (phones.length) {
    conditions.push({ phone: { $in: phones } });
  }

  if (emails.length) {
    conditions.push({ email: { $in: emails } });
  }

  if (!conditions.length) {
    return {
      phoneSet: new Set<string>(),
      emailSet: new Set<string>(),
    };
  }

  const existingLeads = await Lead.find({
    isDeleted: false,
    $or: conditions,
  })
    .select("phone email")
    .lean();

  const phoneSet = new Set(
    existingLeads.map((item) => item.phone).filter(Boolean),
  );

  const emailSet = new Set(
    existingLeads.map((item) => item.email).filter(Boolean),
  );

  return {
    phoneSet,
    emailSet,
  };
};

const importLeads = async (
  file: Express.Multer.File,
  decodedToken: JwtPayload,
) => {
  validateImportFile(file);

  const importedRows = parseImportFile(file.buffer);

  const summary: IImportSummary = {
    total: importedRows.length,
    imported: 0,
    duplicates: 0,
    failed: 0,
  };

  if (importedRows.length > MAX_LEAD_IMPORT_ROWS) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Maximum ${MAX_LEAD_IMPORT_ROWS} leads can be imported at once.`,
    );
  }

  if (!importedRows.length) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "The uploaded file contains no data.",
    );
  }

  const duplicateMaps = await getDuplicateMaps(importedRows);

  const operations: AnyBulkWriteOperation<ILead>[] = [];

  const preparedLeads: IPreparedLead[] = importedRows.map((lead, index) => ({
    rowNumber: index + 2,
    data: lead,
  }));

  const importedPhoneSet = new Set<string>();
  const importedEmailSet = new Set<string>();

  for (const lead of preparedLeads) {
    const errors = validateImportedLead(lead.data);

    if (errors.length) {
      summary.failed++;
      continue;
    }

    const phone = lead.data.phone;
    const email = lead.data.email;

    if (phone) {
      if (duplicateMaps.phoneSet.has(phone) || importedPhoneSet.has(phone)) {
        summary.duplicates++;
        continue;
      }
    }

    if (email) {
      if (duplicateMaps.emailSet.has(email) || importedEmailSet.has(email)) {
        summary.duplicates++;
        continue;
      }
    }

    const isPhoneDuplicate =
      !!phone &&
      (duplicateMaps.phoneSet.has(phone) || importedPhoneSet.has(phone));

    const isEmailDuplicate =
      !!email &&
      (duplicateMaps.emailSet.has(email) || importedEmailSet.has(email));

    if (isPhoneDuplicate || isEmailDuplicate) {
      summary.duplicates++;
      continue;
    }

    operations.push({
      insertOne: {
        document: {
          ...lead.data,
          createdBy: toObjectId(decodedToken.userId),
          updatedBy: toObjectId(decodedToken.userId),
        } as ILead,
      },
    });
  }

  if (!operations.length) {
    return {
      total: summary.total,
      imported: 0,
      duplicates: summary.duplicates,
      failed: summary.failed,
    };
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    await Lead.bulkWrite(operations, {
      ordered: false,
      session,
    });

    await session.commitTransaction();

    summary.imported = operations.length;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  return {
    data: summary,
  };
};

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

const assertValidObjectId = (id: string, label = "Lead id") => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, `Invalid ${label}.`);
  }
};

const assertLeadExists = async (leadId: string) => {
  assertValidObjectId(leadId);

  const lead = await Lead.findOne({ _id: leadId, isDeleted: false });

  if (!lead) {
    throw new AppError(httpStatus.NOT_FOUND, "Lead not found.");
  }

  return lead;
};

const assertAssigneeExists = async (userId: string) => {
  assertValidObjectId(userId, "assignedTo id");

  const user = await User.findOne({ _id: userId, isDeleted: false });

  if (!user) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "The user you are trying to assign this lead to does not exist.",
    );
  }

  return user;
};

// =========================================================
// DATE-WISE FILTERING (same pattern as subscription.service.ts)
// =========================================================

// Which query field maps to which actual Lead document field.
// Extend this map if more date fields need to be filterable.
const dateFieldMap: Record<string, string> = {
  created: "createdAt",
  updatedAt: "updatedAt",
  nextContact: "nextContactAt",
};

// Returns the 00:00:00.000 -> 23:59:59.999 UTC boundary for the calendar
// day represented by a date-only string like "2026-06-18". Using UTC
// components (instead of setHours, which uses server-local time) keeps
// this correct no matter what timezone the server runs in.
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

// Date filtering rules (per product requirement):
// - startDate AND endDate given -> inclusive range between the two days
// - ONLY startDate given        -> records on that single day only
// - ONLY endDate given          -> records on that single day only
// - neither given                -> no date filter
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

  if (startDateStr) {
    const { start, end } = getDayBoundariesUTC(startDateStr);
    return { $gte: start, $lte: end };
  }

  if (endDateStr) {
    const { start, end } = getDayBoundariesUTC(endDateStr);
    return { $gte: start, $lte: end };
  }

  return null;
};

// Decides WHICH field the startDate/endDate query params apply to.
//
// - dateType given (created / updatedAt / nextContact) -> EXPLICIT mode:
//   both params act as bounds on that ONE field (range if both given,
//   exact-day match if only one given).
//
// - dateType NOT given -> DEFAULT mode, applies to createdAt:
//     * ONLY startDate given -> exact-day match on doc.createdAt
//     * ONLY endDate given   -> exact-day match on doc.createdAt
//     * BOTH given           -> range on doc.createdAt between the two days
const buildDateFilterObject = (
  dateType: string | undefined,
  startDateStr?: string,
  endDateStr?: string,
): Record<string, { $gte?: Date; $lte?: Date }> => {
  const result: Record<string, { $gte?: Date; $lte?: Date }> = {};

  const dateField =
    dateType && dateFieldMap[dateType] ? dateFieldMap[dateType] : "createdAt";

  const range = buildDateRangeFilter(startDateStr, endDateStr);

  if (range) {
    result[dateField] = range;
  }

  return result;
};

// Pulls dateType/startDate/endDate out of the raw query, builds the
// Mongo filter object for them, and strips those keys from `query` so
// QueryBuilder doesn't try to treat them as regular filter/search fields.
const buildDateFilter = (query: Record<string, string>) => {
  const dateType = query.dateType;
  const startDateStr = query["startDate"];
  const endDateStr = query["endDate"];

  const dateFilterObj = buildDateFilterObject(
    dateType,
    startDateStr,
    endDateStr,
  );

  delete query.startDate;
  delete query.endDate;
  delete query.dateType;

  return dateFilterObj;
};

const populateOptions = [
  { path: "assignedTo", select: "firstName lastName email designation" },
  { path: "createdBy", select: "firstName lastName email" },
  { path: "updatedBy", select: "firstName lastName email" },
  { path: "convertedBy", select: "firstName lastName email" },
  { path: "notes.createdBy", select: "firstName lastName email" },
  { path: "attachments.uploadedBy", select: "firstName lastName email" },
];

const addAttachment = async (
  leadId: string,
  payload: { title: string; url: string; type?: string },
  decodedToken: JwtPayload,
) => {
  await assertLeadExists(leadId);

  const updatedLead = await Lead.findByIdAndUpdate(
    leadId,
    {
      $push: {
        attachments: {
          title: payload.title,
          url: payload.url,
          type: payload.type,
          uploadedBy: toObjectId(decodedToken.userId),
          uploadedAt: new Date(),
        },
      },
      updatedBy: toObjectId(decodedToken.userId),
    },
    { new: true, runValidators: true },
  ).populate(populateOptions);

  return { data: updatedLead };
};

const createLead = async (
  payload: Partial<ILead>,
  decodedToken: JwtPayload,
) => {
  if (payload.assignedTo) {
    await assertAssigneeExists(payload.assignedTo as unknown as string);
  }

  if(payload.phone){
    const isExistLead= await Lead.findOne({phone: payload?.phone})
       if(isExistLead){
        throw new AppError(httpStatus.CONFLICT, "This phone number alredy exist")
       }

  }

  const lead = await Lead.create({
    ...payload,
    createdBy: toObjectId(decodedToken.userId),
  });

  return { data: lead };
};

const getLeads = async (query: Record<string, string>) => {
  const dateFilterObj = buildDateFilter(query);

  const baseFilter: Record<string, any> = {
    isDeleted: false,
    ...dateFilterObj,
  };

  const queryBuilder = new QueryBuilder(Lead.find(baseFilter), query);

  const leadsQuery = queryBuilder
    .filter()
    .search(leadSearchableFields)
    .sort()
    .fields()
    .paginate();

  const [data, meta] = await Promise.all([
    leadsQuery.build().populate(populateOptions),
    queryBuilder.getMeta(),
  ]);

  return { data, meta };
};

const getDeletedLeads = async (query: Record<string, string>) => {
  const dateFilterObj = buildDateFilter(query);

  const baseFilter: Record<string, any> = {
    isDeleted: true,
    ...dateFilterObj,
  };

  const queryBuilder = new QueryBuilder(Lead.find(baseFilter), query);

  const leadsQuery = queryBuilder
    .filter()
    .search(leadSearchableFields)
    .sort()
    .fields()
    .paginate();

  const [data, meta] = await Promise.all([
    leadsQuery.build().populate(populateOptions),
    queryBuilder.getMeta(),
  ]);

  return { data, meta };
};

const getLeadById = async (id: string) => {
  assertValidObjectId(id);

  const lead = await Lead.findOne({ _id: id, isDeleted: false }).populate(
    populateOptions,
  );

  if (!lead) {
    throw new AppError(httpStatus.NOT_FOUND, "Lead not found.");
  }

  return { data: lead };
};

const updateLead = async (
  leadId: string,
  payload: Partial<ILead>,
  decodedToken: JwtPayload,
) => {
  await assertLeadExists(leadId);

  const sanitizedPayload = stripProtectedFields(payload);

  const updatedLead = await Lead.findByIdAndUpdate(
    leadId,
    {
      ...sanitizedPayload,
      updatedBy: toObjectId(decodedToken.userId),
    },
    { new: true, runValidators: true },
  ).populate(populateOptions);

  return { data: updatedLead };
};

const updateLeadStatus = async (
  leadId: string,
  status: LeadStatus,
  decodedToken: JwtPayload,
) => {
  await assertLeadExists(leadId);

  const updatedLead = await Lead.findByIdAndUpdate(
    leadId,
    {
      status,
      updatedBy: toObjectId(decodedToken.userId),
    },
    { new: true, runValidators: true },
  ).populate(populateOptions);

  return { data: updatedLead };
};

const updateLeadContactStatus = async (
  leadId: string,
  contactStatus: LeadContactStatus,
  nextContactAt: Date | undefined,
  decodedToken: JwtPayload,
) => {
  await assertLeadExists(leadId);

  if (contactStatus === LeadContactStatus.NEXT_CONTACT) {
    if (!nextContactAt) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Next contact date and time are required.",
      );
    }

    if (new Date(nextContactAt).getTime() <= Date.now()) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Next contact time must be in the future.",
      );
    }
  }

  const normalizedNextContactAt =
    contactStatus === LeadContactStatus.NEXT_CONTACT
      ? new Date(nextContactAt!)
      : null;

  const updatedLead = await Lead.findByIdAndUpdate(
    leadId,
    {
      contactStatus,
      nextContactAt: normalizedNextContactAt,
      updatedBy: toObjectId(decodedToken.userId),
    },
    {
      new: true,
      runValidators: true,
    },
  ).populate(populateOptions);

  if (!updatedLead) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      "Lead not found.",
    );
  }

  return {
    data: updatedLead,
  };
};

const assignLead = async (
  leadId: string,
  assignedTo: string,
  decodedToken: JwtPayload,
) => {
  await assertLeadExists(leadId);
  await assertAssigneeExists(assignedTo);

  const updatedLead = await Lead.findByIdAndUpdate(
    leadId,
    {
      assignedTo: toObjectId(assignedTo),
      updatedBy: toObjectId(decodedToken.userId),
    },
    { new: true, runValidators: true },
  ).populate(populateOptions);

  return { data: updatedLead };
};

const addNote = async (
  leadId: string,
  message: string,
  decodedToken: JwtPayload,
) => {
  await assertLeadExists(leadId);

  const updatedLead = await Lead.findByIdAndUpdate(
    leadId,
    {
      $push: {
        notes: {
          message,
          createdBy: toObjectId(decodedToken.userId),
          createdAt: new Date(),
        },
      },
      updatedBy: toObjectId(decodedToken.userId),
    },
    { new: true, runValidators: true },
  ).populate(populateOptions);

  return { data: updatedLead };
};

const convertLead = async (
  leadId: string,
  payload: any,
  decodedToken: JwtPayload,
) => {
  const lead = await assertLeadExists(leadId);

  if (lead.isConverted) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "This lead has already been converted.",
    );
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

  const createdClient = new Client({
  leadId: lead._id,

  assignedManager: lead.assignedTo,
  accountManager: lead.assignedTo,

  clientType: lead.company
    ? ClientType.COMPANY
    : ClientType.INDIVIDUAL,

  companyName: lead.company,
  companyWebsite: lead.website,
  industry: lead.industry,
  companySize: lead.employeeSize,

  firstName: lead.firstName,
  lastName: lead.lastName,
  fullName: lead.fullName,

  email: lead.email,
  phone: lead.phone,
  alternatePhone: lead.alternatePhone,

  country: lead.country,
  state: lead.state,
  city: lead.city,
  zipCode: lead.zipCode,
  address: lead.address,

  preferredContactMethod: lead.preferredContactMethod,

  estimatedValue: lead.estimatedValue,
  budget: lead.budget,
  timeline: lead.timeline,

  requirementTitle: lead.requirementTitle,
  requirementDescription: lead.requirementDescription,

  technologies: lead.technologies,
  services: lead.services,

  tags: lead.tags,
  labels: lead.labels,

  customFields: lead.customFields,

  joinedAt: new Date(),
  lastContactAt: new Date(),

  clientCode: `CLI-${Date.now()}`,

  createdBy: toObjectId(decodedToken.userId),
  updatedBy: toObjectId(decodedToken.userId),
});

await createdClient.save({ session });

   const updatedLead = await Lead.findByIdAndUpdate(
  leadId,
  {
    isConverted: true,
    convertedAt: new Date(),
    convertedBy: toObjectId(decodedToken.userId),

    clientId: createdClient._id,

    status: LeadStatus.WON,

    updatedBy: toObjectId(decodedToken.userId),
  },
  {
    new: true,
    runValidators: true,
    session,
  },
).populate(populateOptions);

    await session.commitTransaction();

    return {
      data: updatedLead,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const softDeleteLead = async (leadId: string, decodedToken: JwtPayload) => {
  await assertLeadExists(leadId);

  await Lead.findByIdAndUpdate(leadId, {
    isDeleted: true,
    deletedAt: new Date(),
    deletedBy: toObjectId(decodedToken.userId),
  });

  return { data: null };
};

const restoreLead = async (leadId: string, decodedToken: JwtPayload) => {
  assertValidObjectId(leadId);

  const lead = await Lead.findOne({ _id: leadId, isDeleted: true });

  if (!lead) {
    throw new AppError(httpStatus.NOT_FOUND, "Deleted lead not found.");
  }

  const updatedLead = await Lead.findByIdAndUpdate(
    leadId,
    {
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      updatedBy: toObjectId(decodedToken.userId),
    },
    { new: true },
  ).populate(populateOptions);

  return { data: updatedLead };
};

const permanentlyDeleteLead = async (
  leadId: string,
  decodedToken: JwtPayload,
) => {
  if (decodedToken.role !== Role.SUPER_ADMIN) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only a Super Admin can permanently delete a lead.",
    );
  }

  assertValidObjectId(leadId);

  const lead = await Lead.findOne({ _id: leadId, isDeleted: true });

  if (!lead) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Only already soft-deleted leads can be permanently deleted.",
    );
  }

  await Lead.findByIdAndDelete(leadId);

  return { data: null };
};

export const LeadServices = {
  createLead,
  getLeads,
  getDeletedLeads,
  getLeadById,
  updateLead,
  updateLeadStatus,
  updateLeadContactStatus,
  assignLead,
  addNote,
  addAttachment,
  convertLead,
  softDeleteLead,
  importLeads,
  restoreLead,
  permanentlyDeleteLead,
};