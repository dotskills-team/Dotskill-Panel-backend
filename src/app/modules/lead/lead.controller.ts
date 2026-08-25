import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";

import { LeadServices } from "./lead.service";
import { ILead, LeadContactStatus, LeadStatus } from "./lead.interface";
import { sendResponse } from "../../utils/sendResponse";

import { catchAsync } from "../../utils/catchAsync";
import AppError from "../../errorHelpers/appError";

const createLead = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const decodedToken = req.user as JwtPayload;

    const result = await LeadServices.createLead(
      req.body as Partial<ILead>,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Lead created successfully.",
      data: result.data,
    });
  },
);

const importLeads = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Please upload a CSV, XLS or XLSX file.",
    );
  }

  const result = await LeadServices.importLeads(
    req.file,
    req.user as JwtPayload,
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `Successfully imported ${result?.data?.imported} lead(s).`,
    data: result.data,
  });
});

const getLeads = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const result = await LeadServices.getLeads(
      req.query as Record<string, string>,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Leads retrieved successfully.",
      data: result.data,
      meta: result.meta,
    });
  },
);

const getDeletedLeads = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const result = await LeadServices.getDeletedLeads(
      req.query as Record<string, string>,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Deleted leads retrieved successfully.",
      data: result.data,
      meta: result.meta,
    });
  },
);

const getLeadById = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const leadId = req.params.id as string;

    const result = await LeadServices.getLeadById(leadId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Lead retrieved successfully.",
      data: result.data,
    });
  },
);

const updateLead = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const leadId = req.params.id as string;
    const decodedToken = req.user as JwtPayload;

    const result = await LeadServices.updateLead(
      leadId,
      req.body as Partial<ILead>,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Lead updated successfully.",
      data: result.data,
    });
  },
);

const updateLeadStatus = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const leadId = req.params.id as string;
    const decodedToken = req.user as JwtPayload;
    const { status } = req.body as { status: LeadStatus };

    const result = await LeadServices.updateLeadStatus(
      leadId,
      status,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Lead status updated successfully.",
      data: result.data,
    });
  },
);

const updateLeadContactStatus = catchAsync(
  async (req: Request, res: Response) => {
    const { leadId } = req.params;

    const { contactStatus, nextContactAt } = req.body;

    const result = await LeadServices.updateLeadContactStatus(
      leadId as string,
      contactStatus as LeadContactStatus,
      nextContactAt,
      req.user,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Lead contact status updated successfully.",
      data: result.data,
    });
  },
);

const assignLead = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const leadId = req.params.id as string;
    const decodedToken = req.user as JwtPayload;
    const { assignedTo } = req.body as { assignedTo: string };

    const result = await LeadServices.assignLead(
      leadId,
      assignedTo,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Lead assigned successfully.",
      data: result.data,
    });
  },
);

const addNote = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const leadId = req.params.id as string;
    const decodedToken = req.user as JwtPayload;
    const { message } = req.body as { message: string };

    const result = await LeadServices.addNote(leadId, message, decodedToken);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Note added successfully.",
      data: result.data,
    });
  },
);

const addAttachment = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const leadId = req.params.id as string;
    const decodedToken = req.user as JwtPayload;
    const { title, url, type } = req.body as {
      title: string;
      url: string;
      type?: string;
    };

    const result = await LeadServices.addAttachment(
      leadId,
      { title, url, type },
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Attachment added successfully.",
      data: result.data,
    });
  },
);

const convertLead = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const leadId = req.params.id as string;
    const decodedToken = req.user as JwtPayload;
    

    const result = await LeadServices.convertLead(
      leadId,
      req.body,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Lead converted successfully.",
      data: result.data,
    });
  },
);

const softDeleteLead = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const leadId = req.params.id as string;
    const decodedToken = req.user as JwtPayload;

    const result = await LeadServices.softDeleteLead(leadId, decodedToken);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Lead moved to trash successfully.",
      data: result.data,
    });
  },
);

const restoreLead = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const leadId = req.params.id as string;
    const decodedToken = req.user as JwtPayload;

    const result = await LeadServices.restoreLead(leadId, decodedToken);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Lead restored successfully.",
      data: result.data,
    });
  },
);

const permanentlyDeleteLead = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const leadId = req.params.id as string;
    const decodedToken = req.user as JwtPayload;

    const result = await LeadServices.permanentlyDeleteLead(
      leadId,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Lead permanently deleted successfully.",
      data: result.data,
    });
  },
);

export const LeadControllers = {
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
  restoreLead,
  importLeads,
  permanentlyDeleteLead,
};