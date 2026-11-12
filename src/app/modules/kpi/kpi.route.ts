import { Router } from "express";
import type { AnyZodObject } from "zod";

import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";
import { Role } from "../user/user.interface";

import { KpiControllers } from "./kpi.controller";
import {
  createKpiValidationSchema,
  updateKpiStatusValidationSchema,
  updateKpiValidationSchema,
} from "./kpi.validation";

const router = Router();

const ADMINS = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER];
const LEAD = Role.MARKETING_SALES_LEAD;
const MEMBER = Role.SALES_MARKETING;

// The service enforces the finer rules (team KPI, drafts, ownership).

// Fixed paths first, so they are not read as "/:id"
router.get(
  "/me",
  checkAuth(...ADMINS, LEAD, MEMBER),
  KpiControllers.getMyKpis,
);

// Progress: targets next to automatic achievements
router.get(
  "/me/progress",
  checkAuth(LEAD, MEMBER),
  KpiControllers.getMyProgress,
);

router.get(
  "/progress/projects",
  checkAuth(...ADMINS),
  KpiControllers.getProgressProjects,
);

router.get(
  "/progress",
  checkAuth(...ADMINS, LEAD),
  KpiControllers.getProgress,
);

router.get(
  "/team/context",
  checkAuth(...ADMINS),
  KpiControllers.getTeamContext,
);

router.get(
  "/team-members",
  checkAuth(...ADMINS, LEAD),
  KpiControllers.getTeamMembers,
);

router.post(
  "/",
  checkAuth(...ADMINS, LEAD),
  validateRequest(createKpiValidationSchema as unknown as AnyZodObject),
  KpiControllers.createKpi,
);

router.get(
  "/",
  checkAuth(...ADMINS, LEAD, MEMBER),
  KpiControllers.getKpis,
);

router.patch(
  "/:id/status",
  checkAuth(...ADMINS, LEAD),
  validateRequest(updateKpiStatusValidationSchema as unknown as AnyZodObject),
  KpiControllers.updateKpiStatus,
);

// Editing and deleting a KPI is admin-only; the lead can only create (and activate/close)
router.patch(
  "/:id",
  checkAuth(...ADMINS),
  validateRequest(updateKpiValidationSchema as unknown as AnyZodObject),
  KpiControllers.updateKpi,
);

router.delete(
  "/:id",
  checkAuth(...ADMINS),
  KpiControllers.deleteKpi,
);

export const KpiRoutes = router;
