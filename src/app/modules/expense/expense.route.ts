import { Router } from "express";
import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";
import { upload } from "../../middlewares/upload";
import { Role } from "../user/user.interface";
import { ExpenseController } from "./expense.controller";
import { createExpenseZodSchema, updateExpenseZodSchema } from "./expense.validation";

const router = Router();

router.post("/", checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.STAFF), upload.single("attachment"), validateRequest(createExpenseZodSchema), ExpenseController.createExpense);
router.get("/", checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER), ExpenseController.getAllExpenses);
router.get("/:id", checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER), ExpenseController.getSingleExpense);
router.patch("/:id", checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.STAFF), upload.single("attachment"), validateRequest(updateExpenseZodSchema), ExpenseController.updateExpense);
router.delete("/:id", checkAuth(Role.SUPER_ADMIN, Role.ADMIN), ExpenseController.deleteExpense);

export const ExpenseRoutes = router;