import { Router } from "express";

import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";
import { Role } from "../user/user.interface";
import {
  CREDENTIAL_ROLES,
  READ_ROLES,
  TargetType,
  WRITE_ROLES,
} from "./domain-hosting.constant";
import {
  addLogZodSchema,
  createDomainZodSchema,
  createHostingZodSchema,
  renewZodSchema,
  updateDomainZodSchema,
  updateHostingZodSchema,
} from "./domain-hosting.validation";
import { DomainHostingController, setTargetType } from "./domain-hosting.controller";

const router = Router();

const canRead = checkAuth(...READ_ROLES);
const canWrite = checkAuth(...WRITE_ROLES);
const canReveal = checkAuth(...CREDENTIAL_ROLES);

/**
 * Registers the CRUD, renewal, log and reveal routes for one target type.
 * Domains and hosting share the same handlers; setTargetType() tells them which
 * collection to use.
 */
const registerTargetRoutes = (
  base: string,
  type: TargetType,
  createSchema: typeof createDomainZodSchema | typeof createHostingZodSchema,
  updateSchema: typeof updateDomainZodSchema | typeof updateHostingZodSchema,
  createHandler: typeof DomainHostingController.createDomain,
  updateHandler: typeof DomainHostingController.updateDomain,
) => {
  router.get(base, canRead, setTargetType(type), DomainHostingController.listTargets);

  router.post(base, canWrite, validateRequest(createSchema), createHandler);

  router.get(`${base}/:id`, canRead, setTargetType(type), DomainHostingController.getTarget);

  router.patch(`${base}/:id`, canWrite, validateRequest(updateSchema), updateHandler);

  router.delete(`${base}/:id`, canWrite, setTargetType(type), DomainHostingController.deleteTarget);

  router.post(
    `${base}/:id/renew`,
    canWrite,
    setTargetType(type),
    validateRequest(renewZodSchema),
    DomainHostingController.renewTarget,
  );

  router.get(`${base}/:id/logs`, canRead, setTargetType(type), DomainHostingController.getLogs);

  router.post(
    `${base}/:id/logs`,
    canWrite,
    setTargetType(type),
    validateRequest(addLogZodSchema),
    DomainHostingController.addLog,
  );

  router.post(
    `${base}/:id/reveal-credential`,
    canReveal,
    setTargetType(type),
    DomainHostingController.revealCredential,
  );
};

// Overview
router.get("/dashboard-summary", canRead, DomainHostingController.getDashboardSummary);

// In-app reminders
router.get("/notifications", canRead, DomainHostingController.getNotifications);
router.patch("/notifications/:id/read", canRead, DomainHostingController.markNotificationRead);

// Manual trigger of the daily job, for external schedulers (e.g. Vercel cron)
router.post("/run-reminders", checkAuth(Role.SUPER_ADMIN), DomainHostingController.runReminders);

// Domains and hosting
registerTargetRoutes(
  "/domains",
  TargetType.DOMAIN,
  createDomainZodSchema,
  updateDomainZodSchema,
  DomainHostingController.createDomain,
  DomainHostingController.updateDomain,
);

registerTargetRoutes(
  "/hosting",
  TargetType.HOSTING,
  createHostingZodSchema,
  updateHostingZodSchema,
  DomainHostingController.createHosting,
  DomainHostingController.updateHosting,
);

export const DomainHostingRoutes = router;
