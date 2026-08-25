import { Router } from "express";

import { LeadControllers } from "./lead.controller";
import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";
import { Role } from "../user/user.interface";
import {
  addAttachmentValidationSchema,
  addNoteValidationSchema,
  assignLeadValidationSchema,
  convertLeadValidationSchema,
  createLeadValidationSchema,
  updateLeadContactStatusValidationSchema,
  updateLeadStatusValidationSchema,
  updateLeadValidationSchema,
} from "./lead.validation";
import { upload } from "../../middlewares/upload";

const router = Router();

router.post(
  "/create",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.MARKETER),
  // validateRequest(createLeadValidationSchema),
  LeadControllers.createLead,
);

router.get(
  "/",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.MARKETER),
  LeadControllers.getLeads,
);

router.get(
  "/trash",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  LeadControllers.getDeletedLeads,
);

router.get(
  "/:id",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.MARKETER),
  LeadControllers.getLeadById,
);

router.patch(
  "/:id",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.MARKETER),
  // validateRequest(updateLeadValidationSchema),
  LeadControllers.updateLead,
);

router.patch(
  "/:id/status",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.MARKETER),
  validateRequest(updateLeadStatusValidationSchema),
  LeadControllers.updateLeadStatus,
);

router.patch(
  "/:leadId/contact-status",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.MARKETER),
  validateRequest(updateLeadContactStatusValidationSchema as any),
  LeadControllers.updateLeadContactStatus,
);

router.patch(
  "/:id/assign",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  validateRequest(assignLeadValidationSchema),
  LeadControllers.assignLead,
);

router.post(
  "/:id/notes",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.MARKETER),
  validateRequest(addNoteValidationSchema),
  LeadControllers.addNote,
);

router.post(
  "/:id/attachments",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.MARKETER),
  validateRequest(addAttachmentValidationSchema),
  LeadControllers.addAttachment,
);

router.post(
  "/import",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.STAFF),
  upload.single("file"),
  LeadControllers.importLeads,
);

router.patch(
  "/:id/convert",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  // validateRequest(convertLeadValidationSchema),
  LeadControllers.convertLead,
);

router.delete(
  "/:id/trash",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  LeadControllers.softDeleteLead,
);

router.patch(
  "/:id/restore",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  LeadControllers.restoreLead,
);

router.delete(
  "/:id/permanent",
  checkAuth(Role.SUPER_ADMIN),
  LeadControllers.permanentlyDeleteLead,
);

export const LeadRoutes = router;
