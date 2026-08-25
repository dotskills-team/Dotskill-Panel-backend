import { Router } from "express";

import { UserControllers } from "./user.controller";
import { validateRequest } from "../../middlewares/validateRequest";
import { checkAuth } from "../../middlewares/checkAuth";

import { Role } from "./user.interface";

import {
  createUserValidationSchema,
  updateUserValidationSchema,
  updateProfileValidationSchema,
  updateRoleValidationSchema,
  updateStatusValidationSchema,
  updatePermissionsValidationSchema,
  changePasswordValidationSchema,
} from "./user.validation";
import type { AnyZodObject } from "zod";

const router = Router();

router.get("/me", checkAuth(), UserControllers.getMe);

router.patch(
  "/me",
  checkAuth(),
  validateRequest(updateProfileValidationSchema),
  UserControllers.updateProfile,
);

router.patch(
  "/change-password",
  checkAuth(),
  validateRequest(changePasswordValidationSchema as unknown as AnyZodObject),
  UserControllers.changePassword,
);

router.post(
  "/create",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN),
  validateRequest(createUserValidationSchema),
  UserControllers.createUser,
);

router.get(
  "/",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  UserControllers.getUsers,
);

router.get(
  "/trash",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN),
  UserControllers.getDeletedUsers,
);

router.get(
  "/:id",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  UserControllers.getUserById,
);

router.patch(
  "/:id",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN),
  validateRequest(updateUserValidationSchema),
  UserControllers.updateUser,
);

router.patch(
  "/:id/role",
  checkAuth(Role.SUPER_ADMIN),
  validateRequest(updateRoleValidationSchema),
  UserControllers.updateUserRole,
);

router.patch(
  "/:id/status",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN),
  validateRequest(updateStatusValidationSchema),
  UserControllers.updateUserStatus,
);

router.patch(
  "/:id/permissions",
  checkAuth(Role.SUPER_ADMIN),
  validateRequest(updatePermissionsValidationSchema),
  UserControllers.updateUserPermissions,
);

router.patch(
  "/:id/soft-delete",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN),
  UserControllers.softDeleteUser,
);

router.patch(
  "/:id/restore",
  checkAuth(Role.SUPER_ADMIN),
  UserControllers.restoreUser,
);

router.delete(
  "/:id/permanent",
  checkAuth(Role.SUPER_ADMIN),
  UserControllers.permanentlyDeleteUser,
);

export const UserRoutes = router;
