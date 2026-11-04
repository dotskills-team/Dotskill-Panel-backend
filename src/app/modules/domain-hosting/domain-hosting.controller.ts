import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { DomainHostingService, DomainHostingActor } from "./domain-hosting.service";
import { TargetType } from "./domain-hosting.constant";
import { runDomainHostingDailyJob } from "./domain-hosting.reminder.service";

/** Reads the logged-in user from the access token. */
const actorOf = (req: Request): DomainHostingActor => ({
  userId: req.user.userId as string,
  role: req.user.role as string,
});

/** The target type (domain or hosting) is set on the route by setTargetType(). */
const targetOf = (res: Response): TargetType => res.locals.targetType as TargetType;

/** Sets the target type for the routes that share a handler. */
export const setTargetType = (type: TargetType) => (_req: Request, res: Response, next: NextFunction) => {
  res.locals.targetType = type;
  next();
};

/* ------------------------------ Domain & hosting ----------------------------- */

const listTargets = catchAsync(async (req, res) => {
  const { result, meta } = await DomainHostingService.listTargets(
    targetOf(res),
    req.query as Record<string, unknown>,
    actorOf(req),
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Records retrieved successfully",
    meta,
    data: result,
  });
});

const getTarget = catchAsync(async (req, res) => {
  const result = await DomainHostingService.getTargetById(
    targetOf(res),
    req.params.id as string,
    actorOf(req),
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Record retrieved successfully",
    data: result,
  });
});

const deleteTarget = catchAsync(async (req, res) => {
  await DomainHostingService.softDeleteTarget(
    targetOf(res),
    req.params.id as string,
    actorOf(req),
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Record deleted successfully",
    data: null,
  });
});

/* ------------------------------------ Domain ------------------------------------ */

const createDomain = catchAsync(async (req, res) => {
  const result = await DomainHostingService.createDomain(req.body, actorOf(req));
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Domain created successfully",
    data: result,
  });
});

const updateDomain = catchAsync(async (req, res) => {
  const result = await DomainHostingService.updateDomain(
    req.params.id as string,
    req.body,
    actorOf(req),
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Domain updated successfully",
    data: result,
  });
});

/* ----------------------------------- Hosting ------------------------------------ */

const createHosting = catchAsync(async (req, res) => {
  const result = await DomainHostingService.createHosting(req.body, actorOf(req));
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Hosting record created successfully",
    data: result,
  });
});

const updateHosting = catchAsync(async (req, res) => {
  const result = await DomainHostingService.updateHosting(
    req.params.id as string,
    req.body,
    actorOf(req),
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Hosting record updated successfully",
    data: result,
  });
});

/* ------------------------------ Renewal and logs -------------------------------- */

const renewTarget = catchAsync(async (req, res) => {
  const result = await DomainHostingService.renewTarget(
    targetOf(res),
    req.params.id as string,
    req.body,
    actorOf(req),
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Renewal recorded successfully",
    data: result,
  });
});

const addLog = catchAsync(async (req, res) => {
  const result = await DomainHostingService.addLog(
    targetOf(res),
    req.params.id as string,
    req.body,
    actorOf(req),
  );
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Log entry added successfully",
    data: result,
  });
});

const getLogs = catchAsync(async (req, res) => {
  const result = await DomainHostingService.getLogs(targetOf(res), req.params.id as string);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Logs retrieved successfully",
    data: result,
  });
});

/* -------------------------------- Credentials ----------------------------------- */

const revealCredential = catchAsync(async (req, res) => {
  // The body is optional: domains need no credentialId, hosting rows do
  const credentialId = req.body?.credentialId as string | undefined;

  const result = await DomainHostingService.revealCredential(
    targetOf(res),
    req.params.id as string,
    credentialId,
    actorOf(req),
    req.ip ?? "",
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Credential revealed",
    data: result,
  });
});

/* ------------------------------- Summary and alerts ----------------------------- */

const getDashboardSummary = catchAsync(async (_req, res) => {
  const result = await DomainHostingService.getDashboardSummary();
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Summary retrieved successfully",
    data: result,
  });
});

const getNotifications = catchAsync(async (req, res) => {
  const result = await DomainHostingService.getNotifications(actorOf(req));
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Notifications retrieved successfully",
    data: result,
  });
});

const markNotificationRead = catchAsync(async (req, res) => {
  await DomainHostingService.markNotificationRead(req.params.id as string, actorOf(req));
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Notification marked as read",
    data: null,
  });
});

/** Runs the daily job on demand (used by external schedulers such as Vercel cron). */
const runReminders = catchAsync(async (_req, res) => {
  const result = await runDomainHostingDailyJob();
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Reminder job completed",
    data: result,
  });
});

export const DomainHostingController = {
  listTargets,
  getTarget,
  deleteTarget,
  createDomain,
  updateDomain,
  createHosting,
  updateHosting,
  renewTarget,
  addLog,
  getLogs,
  revealCredential,
  getDashboardSummary,
  getNotifications,
  markNotificationRead,
  runReminders,
};
