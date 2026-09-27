import { Router } from "express";
import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";
import { Role } from "../user/user.interface";
import { FinancialAccountController } from "./financial-account.controller";
import {
  createFinancialAccountZodSchema,
  updateFinancialAccountZodSchema,
} from "./financial-account.validation";

const router = Router();

router.post(
  "/",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  validateRequest(createFinancialAccountZodSchema),
  FinancialAccountController.createFinancialAccount,
);
router.get(
  "/summary",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  FinancialAccountController.getFinancialAccountSummary,
);
router.get("/", checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER), FinancialAccountController.getAllFinancialAccounts);

router.get(
  "/:id",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  FinancialAccountController.getSingleFinancialAccount,
);

router.patch(
  "/:id",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  validateRequest(updateFinancialAccountZodSchema),
  FinancialAccountController.updateFinancialAccount,
);

router.delete(
  "/:id",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN),
  FinancialAccountController.deleteFinancialAccount,
);

export const FinancialAccountRoutes = router;