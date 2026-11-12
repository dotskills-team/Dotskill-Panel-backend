import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";

import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";

import { ClientServices } from "./client.service";
import { ClientStatus, IClient } from "./client.interface";
import { sanitizeClientForRole } from "../../utils/projectValue";

const createClient = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const decodedToken = req.user as JwtPayload;

    const result = await ClientServices.createClient(
      req.body as Partial<IClient>,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Client created successfully.",
      data: sanitizeClientForRole(result.data, decodedToken.role),
    });
  },
);

const getDeletedClients = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const result = await ClientServices.getDeletedClients(
      req.query as Record<string, string>,
      req.user as JwtPayload,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Deleted clients retrieved successfully.",
      data: result.data,
      meta: result.meta,
    });
  },
);

const getClients = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const result = await ClientServices.getClients(
      req.query as Record<string, string>,
      req.user as JwtPayload,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Clients retrieved successfully.",
      data: result.data,
      meta: result.meta,
      stats: result.stats
    });
  },
);

const getClientById = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const result = await ClientServices.getClientById(
      req.params.id as string,
      req.user as JwtPayload,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Client retrieved successfully.",
      data: result.data,
    });
  },
);

const updateClient = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const decodedToken = req.user as JwtPayload;

    const result = await ClientServices.updateClient(
      req.params.id as string,
      req.body as Partial<IClient>,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Client updated successfully.",
      data: sanitizeClientForRole(result.data, decodedToken.role),
    });
  },
);

const getCreditCandidates = catchAsync(
  async (_req: Request, res: Response, _next: NextFunction) => {
    const result = await ClientServices.getCreditCandidates();

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Credit candidates retrieved successfully.",
      data: result.data,
    });
  },
);

const updateCreditedTo = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const decodedToken = req.user as JwtPayload;

    const result = await ClientServices.updateCreditedTo(
      req.params.id as string,
      req.body.creditedTo as string,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Client credit updated successfully.",
      data: result.data,
    });
  },
);

const updateClientStatus = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const decodedToken = req.user as JwtPayload;

    const result = await ClientServices.updateClientStatus(
      req.params.id as string,
      req.body.status as ClientStatus,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Client status updated successfully.",
      data: sanitizeClientForRole(result.data, decodedToken.role),
    });
  },
);

const assignClientManager = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const decodedToken = req.user as JwtPayload;

    const result = await ClientServices.assignClientManager(
      req.params.id as string,
      req.body.accountManager,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Client assigned successfully.",
      data: sanitizeClientForRole(result.data, decodedToken.role),
    });
  },
);

const addNote = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const decodedToken = req.user as JwtPayload;

    const result = await ClientServices.addNote(
      req.params.id as string,
      req.body.message,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Note added successfully.",
      data: sanitizeClientForRole(result.data, decodedToken.role),
    });
  },
);

const addDocument = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const decodedToken = req.user as JwtPayload;

    const result = await ClientServices.addDocument(
      req.params.id as string,
      req.body,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Document added successfully.",
      data: sanitizeClientForRole(result.data, decodedToken.role),
    });
  },
);

const softDeleteClient = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const decodedToken = req.user as JwtPayload;

    const result = await ClientServices.softDeleteClient(
      req.params.id as string,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Client moved to trash successfully.",
      data: result.data,
    });
  },
);

const restoreClient = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const decodedToken = req.user as JwtPayload;

    const result = await ClientServices.restoreClient(
      req.params.id as string,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Client restored successfully.",
      data: sanitizeClientForRole(result.data, decodedToken.role),
    });
  },
);

const permanentlyDeleteClient = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const decodedToken = req.user as JwtPayload;

    const result = await ClientServices.permanentlyDeleteClient(
      req.params.id as string,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Client permanently deleted successfully.",
      data: result.data,
    });
  },
);

export const ClientControllers = {
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
