import { Router } from "express";

import { ProjectControllers } from "./project.controller";
import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";
import {
  createProjectValidationSchema,
  updateProjectValidationSchema,
} from "./project.validation";
import { Role } from "../user/user.interface";

const router = Router();

router.post(
  "/create",
  checkAuth(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
  ),
  validateRequest(createProjectValidationSchema),
  ProjectControllers.createProject,
);

router.get(
  "/",
  checkAuth(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
  ),
  ProjectControllers.getProjects,
);

router.get(
  "/trash",
  checkAuth(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
  ),
  ProjectControllers.getDeletedProjects,
);

router.get(
  "/:id",
  checkAuth(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
  ),
  ProjectControllers.getProjectById,
);

router.patch(
  "/:id",
  checkAuth(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
  ),
  validateRequest(updateProjectValidationSchema),
  ProjectControllers.updateProject,
);

router.patch(
  "/:id/trash",
  checkAuth(
    Role.SUPER_ADMIN,
    Role.ADMIN,
  ),
  ProjectControllers.softDeleteProject,
);

router.patch(
  "/:id/restore",
  checkAuth(
    Role.SUPER_ADMIN,
    Role.ADMIN,
  ),
  ProjectControllers.restoreProject,
);

export const ProjectRoutes = router;