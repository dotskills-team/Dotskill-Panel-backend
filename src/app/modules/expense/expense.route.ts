import { Router } from "express";
import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";
import { upload } from "../../middlewares/upload";
import { Role } from "../user/user.interface";
import { ExpenseController } from "./expense.controller";
import { createExpenseZodSchema, updateExpenseZodSchema } from "./expense.validation";

const router = Router();

// Every logged-in role can record and read its own expenses; the service
// limits non-admins to their own rows and admins see everything.
router.post("/", checkAuth(...Object.values(Role)), upload.single("attachment"), validateRequest(createExpenseZodSchema), ExpenseController.createExpense);
router.get("/", checkAuth(...Object.values(Role)), ExpenseController.getAllExpenses);
// Must be declared before "/:id" so "summary" is not read as an id.
router.get("/summary", checkAuth(...Object.values(Role)), ExpenseController.getExpenseSummary);
router.get("/:id", checkAuth(...Object.values(Role)), ExpenseController.getSingleExpense);
router.patch("/:id", checkAuth(...Object.values(Role)), upload.single("attachment"), validateRequest(updateExpenseZodSchema), ExpenseController.updateExpense);
router.delete("/:id", checkAuth(Role.SUPER_ADMIN, Role.ADMIN), ExpenseController.deleteExpense);

export const ExpenseRoutes = router;