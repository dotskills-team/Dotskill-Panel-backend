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

router.get(
  "/payments",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN),
  FinancialAccountController.getAllPayments,
);

// Every logged-in role can read accounts; the service limits non-admins to the accounts they own.
router.get("/", checkAuth(...Object.values(Role)), FinancialAccountController.getAllFinancialAccounts);

router.get(
  "/:id",
  checkAuth(...Object.values(Role)),
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