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
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.MARKETER),
  ClientControllers.getClients,
);

router.get(
  "/trash",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  ClientControllers.getDeletedClients,
);

router.get(
  "/:id",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.MARKETER),
  ClientControllers.getClientById,
);

router.patch(
  "/:id",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  validateRequest(updateClientValidationSchema as unknown as AnyZodObject),
  ClientControllers.updateClient,
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
