import { Router } from "express";
import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";
import { validateQuery } from "../../middlewares/validateQuery";
import { multerUpload } from "../../config/multer.config";
import { Role } from "../user/user.interface";
import { LeaveController, LeaveInsightsController, LeaveReportController } from "./leave.controller";
import {
  auditLogQuerySchema,
  reportExportQuerySchema,
  reportQuerySchema,
  adjustBalanceZodSchema,
  approveLeaveZodSchema,
  balanceQuerySchema,
  calendarQuerySchema,
  conflictsQuerySchema,
  runJobsZodSchema,
  createForStaffZodSchema,
  createLeaveRequestZodSchema,
  listLeaveRequestsQuerySchema,
  recommendLeaveZodSchema,
  rejectLeaveZodSchema,
  updateLeaveRequestZodSchema,
  updatePolicyZodSchema,
} from "./leave.validation";

const router = Router();

const everyone = checkAuth(...Object.values(Role));
const approvers = checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER);
const admins = checkAuth(Role.SUPER_ADMIN, Role.ADMIN);
const managersOnly = checkAuth(Role.MANAGER);

/* ------------------------------- requests -------------------------------- */

// Live day count and over-balance warning for the form (nothing is saved).
router.post(
  "/requests/preview",
  everyone,
  validateRequest(createLeaveRequestZodSchema),
  LeaveController.previewRequest,
);

router.post(
  "/requests",
  everyone,
  validateRequest(createLeaveRequestZodSchema),
  LeaveController.createRequest,
);

// Staff see their own requests; approvers see everyone's (enforced in the service).
router.get(
  "/requests",
  everyone,
  validateQuery(listLeaveRequestsQuerySchema),
  LeaveController.listRequests,
);

router.get("/requests/:id", everyone, LeaveController.getRequest);

router.patch("/requests/:id/cancel", everyone, LeaveController.cancelRequest);

router.patch(
  "/requests/:id/approve",
  approvers,
  validateRequest(approveLeaveZodSchema),
  LeaveController.approveRequest,
);

router.patch(
  "/requests/:id/reject",
  approvers,
  validateRequest(rejectLeaveZodSchema),
  LeaveController.rejectRequest,
);

router.post(
  "/requests/:id/recommend",
  managersOnly,
  validateRequest(recommendLeaveZodSchema),
  LeaveController.recommendRequest,
);

router.patch(
  "/requests/:id",
  approvers,
  validateRequest(updateLeaveRequestZodSchema),
  LeaveController.updateRequest,
);

router.post(
  "/admin/create-for-staff",
  admins,
  validateRequest(createForStaffZodSchema),
  LeaveController.createForStaff,
);

/* ------------------- calendar, conflicts, summary, jobs ------------------ */

// Everyone sees the team calendar; the service hides reasons and types from staff.
router.get(
  "/calendar",
  everyone,
  validateQuery(calendarQuerySchema),
  LeaveInsightsController.getCalendar,
);

router.get(
  "/conflicts",
  approvers,
  validateQuery(conflictsQuerySchema),
  LeaveInsightsController.getConflicts,
);

router.get("/dashboard-summary", everyone, LeaveInsightsController.getDashboardSummary);

router.post("/jobs/run", admins, validateRequest(runJobsZodSchema), LeaveInsightsController.runJobs);

/* ------------------------- reports and audit log ------------------------- */

router.get("/reports", approvers, validateQuery(reportQuerySchema), LeaveReportController.getReport);
router.get(
  "/reports/export",
  approvers,
  validateQuery(reportExportQuerySchema),
  LeaveReportController.exportReport,
);
router.get("/audit-logs", admins, validateQuery(auditLogQuerySchema), LeaveReportController.listAuditLogs);

/* ------------------------------ attachments ------------------------------ */

router.post("/attachments", everyone, multerUpload.single("file"), LeaveController.uploadAttachment);

/* -------------------------------- balance -------------------------------- */

router.get("/balance/me", everyone, validateQuery(balanceQuerySchema), LeaveController.getMyBalance);

router.get(
  "/balance/:staffId",
  approvers,
  validateQuery(balanceQuerySchema),
  LeaveController.getStaffBalance,
);

router.post(
  "/balance/:staffId/adjust",
  admins,
  validateRequest(adjustBalanceZodSchema),
  LeaveController.adjustBalance,
);

/* --------------------------------- policy -------------------------------- */

// Read by every role: the request form needs off days and holidays for its live day count.
router.get("/policy", everyone, LeaveController.getPolicy);
router.put("/policy", admins, validateRequest(updatePolicyZodSchema), LeaveController.updatePolicy);

export const LeaveRoutes = router;
