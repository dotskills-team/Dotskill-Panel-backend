import { Request } from "express";
import { StatusCodes } from "http-status-codes";
import AppError from "../../errorHelpers/appError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AttendanceActor } from "./attendance.interface";
import { AttendanceService } from "./attendance.service";

const actorOf = (req: Request): AttendanceActor => ({
  userId: req.user.userId,
  role: req.user.role,
});

const idParam = (req: Request) => {
  const value = req.params.id;
  if (typeof value !== "string" || !/^[0-9a-fA-F]{24}$/.test(value)) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Invalid id");
  }
  return value;
};

const checkIn = catchAsync(async (req, res) => {
  const result = await AttendanceService.checkIn(actorOf(req));
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Checked in",
    data: result,
  });
});

const checkOut = catchAsync(async (req, res) => {
  const result = await AttendanceService.checkOut(actorOf(req));
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Checked out",
    data: result,
  });
});

const startBreak = catchAsync(async (req, res) => {
  const result = await AttendanceService.startBreak(actorOf(req));
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Break started",
    data: result,
  });
});

const endBreak = catchAsync(async (req, res) => {
  const result = await AttendanceService.endBreak(actorOf(req));
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Break ended",
    data: result,
  });
});

const getToday = catchAsync(async (req, res) => {
  const result = await AttendanceService.getToday(actorOf(req));
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Today's attendance retrieved",
    data: result,
  });
});

const getMyMonth = catchAsync(async (req, res) => {
  const { month } = req.query as { month?: string };
  const result = await AttendanceService.getMyMonth(actorOf(req), month);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Monthly attendance retrieved",
    data: result,
  });
});

const list = catchAsync(async (req, res) => {
  const { result, meta } = await AttendanceService.list(req.query as never);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Attendance records retrieved",
    meta,
    data: result,
  });
});

const getSummary = catchAsync(async (req, res) => {
  const { month } = req.query as { month?: string };
  const result = await AttendanceService.getSummary(month);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Attendance summary retrieved",
    data: result,
  });
});

const update = catchAsync(async (req, res) => {
  const result = await AttendanceService.update(idParam(req), req.body, actorOf(req));
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Attendance record updated",
    data: result,
  });
});

const create = catchAsync(async (req, res) => {
  const result = await AttendanceService.create(req.body, actorOf(req));
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Attendance record created",
    data: result,
  });
});

export const AttendanceController = {
  checkIn,
  checkOut,
  startBreak,
  endBreak,
  getToday,
  getMyMonth,
  list,
  getSummary,
  update,
  create,
};
