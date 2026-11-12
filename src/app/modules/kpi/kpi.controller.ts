import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";

import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";

import { KpiProgressServices } from "./kpi.progress.service";
import { KpiServices } from "./kpi.service";
import {
  listKpiQuerySchema,
  monthQuerySchema,
  progressProjectsQuerySchema,
} from "./kpi.validation";

const createKpi = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const result = await KpiServices.createKpi(req.body, req.user as JwtPayload);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "KPI created successfully.",
      data: result.data,
    });
  },
);

const updateKpi = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const result = await KpiServices.updateKpi(
      req.params.id as string,
      req.body,
      req.user as JwtPayload,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "KPI updated successfully.",
      data: result.data,
    });
  },
);

const deleteKpi = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    await KpiServices.deleteKpi(req.params.id as string, req.user as JwtPayload);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "KPI deleted successfully.",
      data: null,
    });
  },
);

const updateKpiStatus = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const result = await KpiServices.updateKpiStatus(
      req.params.id as string,
      req.body.status as string,
      req.user as JwtPayload,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "KPI status updated successfully.",
      data: result.data,
    });
  },
);

const getKpis = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const query = listKpiQuerySchema.parse(req.query);
    const result = await KpiServices.getKpis(query, req.user as JwtPayload);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "KPIs retrieved successfully.",
      data: result.data,
      meta: result.meta,
    });
  },
);

const getMyKpis = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { month } = monthQuerySchema.parse(req.query);
    const result = await KpiServices.getMyKpis(month, req.user as JwtPayload);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Your KPIs retrieved successfully.",
      data: result.data,
    });
  },
);

const getTeamContext = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { month } = monthQuerySchema.parse(req.query);
    const result = await KpiServices.getTeamContext(month, req.user as JwtPayload);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Team KPI context retrieved successfully.",
      data: result.data,
    });
  },
);

const getTeamMembers = catchAsync(
  async (_req: Request, res: Response, _next: NextFunction) => {
    const result = await KpiServices.getTeamMembers();

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Team members retrieved successfully.",
      data: result.data,
    });
  },
);

const getMyProgress = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { month } = monthQuerySchema.parse(req.query);
    const result = await KpiProgressServices.getMyProgress(month, req.user as JwtPayload);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Your KPI progress retrieved successfully.",
      data: result.data,
    });
  },
);

const getProgress = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { month } = monthQuerySchema.parse(req.query);
    const result = await KpiProgressServices.getProgress(month, req.user as JwtPayload);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "KPI progress retrieved successfully.",
      data: result.data,
    });
  },
);

const getProgressProjects = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { month, userId } = progressProjectsQuerySchema.parse(req.query);
    const result = await KpiProgressServices.getProjectBreakdown(
      month,
      userId,
      req.user as JwtPayload,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "KPI project breakdown retrieved successfully.",
      data: result.data,
    });
  },
);

export const KpiControllers = {
  getMyProgress,
  getProgress,
  getProgressProjects,
  createKpi,
  updateKpi,
  deleteKpi,
  updateKpiStatus,
  getKpis,
  getMyKpis,
  getTeamContext,
  getTeamMembers,
};
