import { Router } from "express";
import { authRoutes } from "../modules/auth/auth.route";
import { UserRoutes } from "../modules/user/user.route";
import { LeadRoutes } from "../modules/lead/lead.route";
import { ClientRoutes } from "../modules/clients/client.route";
import { ProjectRoutes } from "../modules/project/project.route";
import { TeamSalaryRoutes } from "../modules/team-salary/team-salary.route";
import { FinancialAccountRoutes } from "../modules/financial-account/financial-account.route";
import { ExpenseCategoryRoutes } from "../modules/expense-category/expense-category.route";
import { ExpenseRoutes } from "../modules/expense/expense.route";

export const router = Router();

const moduleRoutes = [
  {
    path: "/user",
    route: UserRoutes,
  },
  {
    path: "/auth",
    route: authRoutes,
  },
  {
    path: "/leads",
    route: LeadRoutes,
  },
  {
    path: "/clients",
    route: ClientRoutes,
  },
   {
    path: "/projects",
    route: ProjectRoutes,
  },
  {
    path: "/team-salaries",
    route: TeamSalaryRoutes,
  },
  { path: "/financial-accounts", route: FinancialAccountRoutes },
{ path: "/expense-categories", route: ExpenseCategoryRoutes },
{ path: "/expenses", route: ExpenseRoutes },
 
];

moduleRoutes.forEach((route) => {
  router.use(route.path, route.route);
});
