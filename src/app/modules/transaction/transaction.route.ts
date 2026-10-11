import { Router } from "express";
import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";
import { Role } from "../user/user.interface";
import { TransactionController } from "./transaction.controller";
import { depositZodSchema } from "./transaction.validation";

const router = Router();

router.post(
  "/deposit",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN),
  validateRequest(depositZodSchema),
  TransactionController.deposit,
);

router.get(
  "/",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER),
  TransactionController.getAllTransactions,
);

export const TransactionRoutes = router;