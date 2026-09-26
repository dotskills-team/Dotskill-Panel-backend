import { Router } from "express";
import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";
import { Role } from "../user/user.interface";
import { ExpenseCategoryController } from "./expense-category.controller";
import {
  createExpenseCategoryZodSchema,
  updateExpenseCategoryZodSchema,
} from "./expense-category.validation";

const router = Router();
router.post("/", checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER), validateRequest(createExpenseCategoryZodSchema), ExpenseCategoryController.createExpenseCategory);
router.get("/", checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER), ExpenseCategoryController.getAllExpenseCategories);
router.get("/:id", checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER), ExpenseCategoryController.getSingleExpenseCategory);
router.patch("/:id", checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER), validateRequest(updateExpenseCategoryZodSchema), ExpenseCategoryController.updateExpenseCategory);
router.delete("/:id", checkAuth(Role.SUPER_ADMIN, Role.ADMIN), ExpenseCategoryController.deleteExpenseCategory);

export const ExpenseCategoryRoutes = router;