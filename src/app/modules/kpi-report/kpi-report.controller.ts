import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";

import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { currentDhakaMonth } from "../kpi/kpi.month";

import { KpiReportServices } from "./kpi-report.service";
import {
  listReportQuerySchema,
  monthParamSchema,
  monthQuerySchema,
  reportContentSchema,
  reviewReportSchema,
} from "./kpi-report.validation";

const getMyReport = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { month } = monthQuerySchema.parse(req.query);
    const result = await KpiReportServices.getMyReport(
      month ?? currentDhakaMonth(),
      req.user as JwtPayload,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "KPI report retrieved successfully.",
      data: result.data,
    });
  },
);

const saveDraft = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { month } = monthParamSchema.parse(req.params);
    const result = await KpiReportServices.saveDraft(month, req.body, req.user as JwtPayload);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "KPI report draft saved successfully.",
      data: result.data,
    });
  },
);

const submitReport = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { month } = monthParamSchema.parse(req.params);
    // The body is optional on submit: it may carry last-minute edits
    const input = reportContentSchema.parse(req.body ?? {});
    const result = await KpiReportServices.submitReport(month, input, req.user as JwtPayload);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "KPI report submitted successfully.",
      data: result.data,
    });
  },
);

const getReports = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const query = listReportQuerySchema.parse(req.query);
    const result = await KpiReportServices.getReports(query, req.user as JwtPayload);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "KPI reports retrieved successfully.",
      data: result.data,
      meta: result.meta,
    });
  },
);

const reviewReport = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { comment } = reviewReportSchema.parse(req.body ?? {});
    const result = await KpiReportServices.reviewReport(
      req.params.id as string,
      comment,
      req.user as JwtPayload,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "KPI report reviewed successfully.",
      data: result.data,
    });
  },
);

const returnReport = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const result = await KpiReportServices.returnReport(
      req.params.id as string,
      req.body.comment as string,
      req.user as JwtPayload,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "KPI report returned to draft.",
      data: result.data,
    });
  },
);

const getSummary = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const { month } = monthQuerySchema.parse(req.query);
    const result = await KpiReportServices.getSummary(month, req.user as JwtPayload);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "KPI report summary retrieved successfully.",
      data: result.data,
    });
  },
);

export const KpiReportControllers = {
  getMyReport,
  saveDraft,
  submitReport,
  getReports,
  reviewReport,
  returnReport,
  getSummary,
};
