import { Router } from "express";
import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";
import { Role } from "../user/user.interface";
import { FundTransferController } from "./fund-transfer.controller";
import { createFundTransferZodSchema } from "./fund-transfer.validation";

const router = Router();

router.post(
  "/",
  checkAuth(Role.SUPER_ADMIN, Role.ADMIN),
  validateRequest(createFundTransferZodSchema),
  FundTransferController.createFundTransfer,
);

router.get("/", checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER), FundTransferController.getAllFundTransfers);

router.get("/:id", checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER), FundTransferController.getSingleFundTransfer);

router.delete("/:id", checkAuth(Role.SUPER_ADMIN), FundTransferController.deleteFundTransfer);

export const FundTransferRoutes = router;