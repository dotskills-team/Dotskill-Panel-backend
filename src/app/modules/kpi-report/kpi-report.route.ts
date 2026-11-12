import { Router } from "express";
import type { AnyZodObject } from "zod";

import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";
import { Role } from "../user/user.interface";

import { KpiReportControllers } from "./kpi-report.controller";
import {
  reportContentSchema,
  returnReportValidationSchema,
} from "./kpi-report.validation";

const router = Router();

const ADMINS = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER];
const LEAD = Role.MARKETING_SALES_LEAD;
const MEMBER = Role.SALES_MARKETING;

// The service enforces ownership and the lead/admin review rules.

// Owner: a report exists only for the caller's own active or closed KPI
router.get("/me", checkAuth(LEAD, MEMBER), KpiReportControllers.getMyReport);

router.put(
  "/me/:month",
  checkAuth(LEAD, MEMBER),
  validateRequest(reportContentSchema as unknown as AnyZodObject),
  KpiReportControllers.saveDraft,
);

router.post(
  "/me/:month/submit",
  checkAuth(LEAD, MEMBER),
  KpiReportControllers.submitReport,
);

// Fixed paths before the "/:id/..." routes
router.get("/summary", checkAuth(...ADMINS, LEAD), KpiReportControllers.getSummary);

router.get("/", checkAuth(...ADMINS, LEAD), KpiReportControllers.getReports);

router.post(
  "/:id/review",
  checkAuth(...ADMINS, LEAD),
  KpiReportControllers.reviewReport,
);

router.post(
  "/:id/return",
  checkAuth(...ADMINS, LEAD),
  validateRequest(returnReportValidationSchema as unknown as AnyZodObject),
  KpiReportControllers.returnReport,
);

export const KpiReportRoutes = router;
