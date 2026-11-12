import { Router } from "express";
import type { AnyZodObject } from "zod";

import { ClientControllers } from "./client.controller";

import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";

import { Role } from "../user/user.interface";

import {
  addClientDocumentValidationSchema,
  addClientNoteValidationSchema,
  assignClientManagerValidationSchema,
  createClientValidationSchema,
  updateClientStatusValidationSchema,
  updateClientValidationSchema,
  updateCreditedToValidationSchema,
} from "./client.validation";

const router = Router();

router.post(
  "/create",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  validateRequest(createClientValidationSchema as unknown as AnyZodObject),
  ClientControllers.createClient,
);

router.get(
  "/",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.SALES_MARKETING, Role.MARKETING_SALES_LEAD),
  ClientControllers.getClients,
);

// Must be declared BEFORE "/:id"
router.get(
  "/credit-candidates",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MARKETING_SALES_LEAD),
  ClientControllers.getCreditCandidates,
);

router.get(
  "/trash",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  ClientControllers.getDeletedClients,
);

router.get(
  "/:id",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.SALES_MARKETING, Role.MARKETING_SALES_LEAD),
  ClientControllers.getClientById,
);

router.patch(
  "/:id",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  validateRequest(updateClientValidationSchema as unknown as AnyZodObject),
  ClientControllers.updateClient,
);

// Admins and the marketing & sales lead may change who a client is credited to
router.patch(
  "/:id/credited-to",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MARKETING_SALES_LEAD),
  validateRequest(
    updateCreditedToValidationSchema as unknown as AnyZodObject,
  ),
  ClientControllers.updateCreditedTo,
);

router.patch(
  "/:id/status",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  validateRequest(
    updateClientStatusValidationSchema as unknown as AnyZodObject,
  ),
  ClientControllers.updateClientStatus,
);

router.patch(
  "/:id/assign",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  validateRequest(
    assignClientManagerValidationSchema as unknown as AnyZodObject,
  ),
  ClientControllers.assignClientManager,
);

router.post(
  "/:id/notes",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.STAFF),
  validateRequest(addClientNoteValidationSchema as unknown as AnyZodObject),
  ClientControllers.addNote,
);

router.post(
  "/:id/documents",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.STAFF),
  validateRequest(addClientDocumentValidationSchema as unknown as AnyZodObject),
  ClientControllers.addDocument,
);

router.patch(
  "/:id/restore",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN),
  ClientControllers.restoreClient,
);

router.patch(
  "/:id/soft-delete",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN),
  ClientControllers.softDeleteClient,
);

router.delete(
  "/:id/permanent",
  checkAuth(Role.SUPER_ADMIN),
  ClientControllers.permanentlyDeleteClient,
);

export const ClientRoutes = router;
