import { Request } from "express";
import { StatusCodes } from "http-status-codes";
import AppError from "../../errorHelpers/appError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { LeaveActor } from "./leave.interface";
import { LeaveService } from "./leave.service";
import { LeaveBalanceService } from "./leave.balance.service";
import { LeavePolicyService } from "./leave.policy.service";
import { LeaveCalendarService } from "./leave.calendar.service";
import { LeaveReportService } from "./leave.report.service";
import {
  runAllLeaveJobs,
  runYearlyRollover,
  sendStalePendingReminders,
  sendUpcomingLeaveReminders,
} from "./leave.jobs";

const actorOf = (req: Request): LeaveActor => ({
  userId: req.user.userId,
  role: req.user.role,
});

const idParam = (req: Request, name = "id") => {
  const value = req.params[name];
  if (typeof value !== "string" || !/^[0-9a-fA-F]{24}$/.test(value)) {
    throw new AppError(StatusCodes.BAD_REQUEST, `Invalid ${name}`);
  }
  return value;
};

const previewRequest = catchAsync(async (req, res) => {
  const result = await LeaveService.previewRequest(actorOf(req), req.body);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave preview calculated",
    data: result,
  });
});

const createRequest = catchAsync(async (req, res) => {
  const result = await LeaveService.createRequest(actorOf(req), req.body);
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Leave request submitted",
    data: result,
  });
});

const createForStaff = catchAsync(async (req, res) => {
  const result = await LeaveService.createForStaff(actorOf(req), req.body);
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Leave added for staff member",
    data: result,
  });
});

const listRequests = catchAsync(async (req, res) => {
  const { result, meta } = await LeaveService.listRequests(req.query as never, actorOf(req));
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave requests retrieved",
    meta,
    data: result,
  });
});

const getRequest = catchAsync(async (req, res) => {
  const result = await LeaveService.getRequest(idParam(req), actorOf(req));
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave request retrieved",
    data: result,
  });
});

const cancelRequest = catchAsync(async (req, res) => {
  const result = await LeaveService.cancelRequest(idParam(req), actorOf(req));
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave request cancelled",
    data: result,
  });
});

const approveRequest = catchAsync(async (req, res) => {
  const result = await LeaveService.approveRequest(idParam(req), actorOf(req), req.body);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave request approved",
    data: result,
  });
});

const rejectRequest = catchAsync(async (req, res) => {
  const result = await LeaveService.rejectRequest(idParam(req), actorOf(req), req.body);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave request rejected",
    data: result,
  });
});

const recommendRequest = catchAsync(async (req, res) => {
  const result = await LeaveService.recommendRequest(idParam(req), actorOf(req), req.body.note);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Recommendation added",
    data: result,
  });
});

const updateRequest = catchAsync(async (req, res) => {
  const result = await LeaveService.updateRequest(idParam(req), actorOf(req), req.body);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave request updated",
    data: result,
  });
});

const getMyBalance = catchAsync(async (req, res) => {
  const year = (req.query.year as unknown as number | undefined) ?? new Date().getUTCFullYear();
  const result = await LeaveBalanceService.getBalanceSummary(req.user.userId, year);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave balance retrieved",
    data: result,
  });
});

const getStaffBalance = catchAsync(async (req, res) => {
  const year = (req.query.year as unknown as number | undefined) ?? new Date().getUTCFullYear();
  const result = await LeaveBalanceService.getBalanceSummary(idParam(req, "staffId"), year);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave balance retrieved",
    data: result,
  });
});

const adjustBalance = catchAsync(async (req, res) => {
  const result = await LeaveBalanceService.adjustBalance(
    idParam(req, "staffId"),
    req.body,
    req.user.userId,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave balance adjusted",
    data: result,
  });
});

const getPolicy = catchAsync(async (_req, res) => {
  const result = await LeavePolicyService.getPolicy();
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave policy retrieved",
    data: result,
  });
});

const updatePolicy = catchAsync(async (req, res) => {
  const result = await LeavePolicyService.updatePolicy(req.body, req.user.userId);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave policy updated",
    data: result,
  });
});

/** Returns the Cloudinary URL of an uploaded supporting document (e.g. a medical certificate). */
const uploadAttachment = catchAsync(async (req, res) => {
  const file = req.file as (Express.Multer.File & { path?: string }) | undefined;
  if (!file?.path) throw new AppError(StatusCodes.BAD_REQUEST, "No file uploaded");
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "File uploaded",
    data: { url: file.path, name: file.originalname },
  });
});

export const LeaveController = {
  previewRequest,
  createRequest,
  createForStaff,
  listRequests,
  getRequest,
  cancelRequest,
  approveRequest,
  rejectRequest,
  recommendRequest,
  updateRequest,
  getMyBalance,
  getStaffBalance,
  adjustBalance,
  getPolicy,
  updatePolicy,
  uploadAttachment,
};

/* ----------------------- calendar, conflicts, summary ---------------------- */

const getCalendar = catchAsync(async (req, res) => {
  const { from, to } = req.query as unknown as { from: string; to: string };
  const result = await LeaveCalendarService.getCalendar(actorOf(req), from, to);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave calendar retrieved",
    data: result,
  });
});

const getConflicts = catchAsync(async (req, res) => {
  const result = await LeaveCalendarService.getConflicts(
    actorOf(req),
    req.query as unknown as { from: string; to: string; department?: string; excludeRequestId?: string },
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave conflicts retrieved",
    data: result,
  });
});

const getDashboardSummary = catchAsync(async (req, res) => {
  const result = await LeaveCalendarService.getDashboardSummary(actorOf(req));
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave summary retrieved",
    data: result,
  });
});

/** Lets an external scheduler run the cron jobs where no long-lived server exists. */
const runJobs = catchAsync(async (req, res) => {
  const { job, year } = req.body as { job: "reminders" | "stale" | "rollover" | "all"; year?: number };
  const result =
    job === "reminders"
      ? { reminders: await sendUpcomingLeaveReminders() }
      : job === "stale"
        ? { stale: await sendStalePendingReminders() }
        : job === "rollover"
          ? { rollover: await runYearlyRollover(year) }
          : await runAllLeaveJobs();
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave jobs completed",
    data: result,
  });
});



export const LeaveInsightsController = { getCalendar, getConflicts, getDashboardSummary, runJobs };

/* ------------------------------ reports, audit ------------------------------ */

const getReport = catchAsync(async (req, res) => {
  const { year, month, staff } = req.query as unknown as { year: number; month?: number; staff?: string };
  const result = await LeaveReportService.getReport(year, month, staff);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave report retrieved",
    data: result,
  });
});

const exportReport = catchAsync(async (req, res) => {
  const { year, month, format, staff } = req.query as unknown as {
    year: number;
    month?: number;
    format: "xlsx" | "pdf";
    staff?: string;
  };
  const file = await LeaveReportService.exportReport(year, month, format, staff);
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.send(file.buffer);
});

const listAuditLogs = catchAsync(async (req, res) => {
  const { result, meta } = await LeaveReportService.listAuditLogs(req.query as never);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Leave audit log retrieved",
    meta,
    data: result,
  });
});

export const LeaveReportController = { getReport, exportReport, listAuditLogs };
