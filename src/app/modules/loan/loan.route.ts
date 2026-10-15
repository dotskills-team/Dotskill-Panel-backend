import { Router } from "express";
import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";
import { Role } from "../user/user.interface";
import { LoanController } from "./loan.controller";
import { createLoanZodSchema, repayLoanZodSchema, updateLoanZodSchema } from "./loan.validation";

const router = Router();

router.get(
  "/summary",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  LoanController.getLoanSummary,
);

router.post(
  "/",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN),
  validateRequest(createLoanZodSchema),
  LoanController.createLoan,
);

router.post(
  "/:id/repay",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN),
  validateRequest(repayLoanZodSchema),
  LoanController.repayLoan,
);

router.get(
  "/",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  LoanController.getAllLoans,
);

router.patch(
  "/:id",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN),
  validateRequest(updateLoanZodSchema),
  LoanController.updateLoan,
);

router.delete(
  "/:id",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN),
  LoanController.deleteLoan,
);

export const LoanRoutes = router;