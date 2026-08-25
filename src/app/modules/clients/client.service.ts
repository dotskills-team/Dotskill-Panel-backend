import httpStatus from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";
import { Types } from "mongoose";

import AppError from "../../errorHelpers/appError";
import { QueryBuilder } from "../../utils/QueryBuilder";

import { Client } from "./client.model";
import { ClientStatus, IClient } from "./client.interface";
import { clientSearchableFields } from "./client.constant";

import { User } from "../user/user.model";
import { Role } from "../user/user.interface";
import { ClientNote } from "./clientNote/clientNote.model";
import { ClientDocument } from "./clientDocument/clientDocument.model";
import {
  ClientDocumentType,
} from "./clientDocument/clientDocument.interface";

const PROTECTED_FIELDS: (keyof IClient | string)[] = [
  "_id",

  "leadId",
  "clientCode",

  "createdBy",
  "updatedBy",

  "deletedBy",
  "deletedAt",
  "isDeleted",

  "createdAt",
  "updatedAt",

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

const buildDateFilter = (query: Record<string, string>) => {
  const dateFilter: Record<string, Date> = {};

  if (query["createdAt[gte]"]) {
    dateFilter.$gte = new Date(query["createdAt[gte]"]) as unknown as Date;
  }

  if (query["createdAt[lte]"]) {
    dateFilter.$lte = new Date(query["createdAt[lte]"]) as unknown as Date;
  }

  return Object.keys(dateFilter).length ? dateFilter : undefined;
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

const getClients = async (query: Record<string, string>) => {
  const dateFilter = buildDateFilter(query);

  const baseFilter: Record<string, any> = {
    isDeleted: false,
  };

  if (dateFilter) {
    baseFilter.createdAt = dateFilter;
  }

  const queryBuilder = new QueryBuilder(
    Client.find(baseFilter),
    sanitizeQuery(query),
  );

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
    data,
    meta,
  };
};

const getDeletedClients = async (query: Record<string, string>) => {
  const dateFilter = buildDateFilter(query);

  const baseFilter: Record<string, any> = {
    isDeleted: true,
  };

  if (dateFilter) {
    baseFilter.createdAt = dateFilter;
  }

  const queryBuilder = new QueryBuilder(
    Client.find(baseFilter),
    sanitizeQuery(query),
  );

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
    data,
    meta,
  };
};

const getClientById = async (clientId: string) => {
  assertValidObjectId(clientId);

  const client = await Client.findOne({
    _id: clientId,
    isDeleted: false,
  }).populate(populateOptions);

  if (!client) {
    throw new AppError(httpStatus.NOT_FOUND, "Client not found.");
  }

  return {
    data: client,
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

  const updatedClient = await Client.findByIdAndUpdate(
    clientId,
    {
      ...sanitizedPayload,
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
  updateClientStatus,
  assignClientManager,

  addNote,
  addDocument,

  softDeleteClient,
  restoreClient,
  permanentlyDeleteClient,
};
