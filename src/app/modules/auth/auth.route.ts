import express from "express";
import { AuthControllers } from "./auth.controller";
import { checkAuth } from "../../middlewares/checkAuth";
import { Role } from "../user/user.interface";
import { validateRequest } from "../../middlewares/validateRequest";
import { changePasswordZodSchema, forgotPasswordZodSchema, resetPasswordZodSchema } from "./auth.validation";
const router = express.Router();

router.post("/login", AuthControllers.credentialLogin);
router.post("/logout", AuthControllers.logout);
router.post("/refresh-token", AuthControllers.getNewAccessToken);
router.post(
  "/change-password",
  checkAuth(...Object.values(Role)),
  validateRequest(changePasswordZodSchema),
  AuthControllers.changePassword,
);
router.post(
  "/forgot-password",
  validateRequest(forgotPasswordZodSchema),
  AuthControllers.forgotPassword,
);

router.post(
  "/reset-password",
  validateRequest(resetPasswordZodSchema),
  AuthControllers.resetPassword,
);
router.post(
  "/admin/change-password",
  checkAuth(Role.ADMIN),
  AuthControllers.adminChangePassword,
);

export const authRoutes = router;
