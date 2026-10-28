import { Router } from "express";

import { TeamSalaryControllers } from "./team-salary.controller";
import { Role } from "../user/user.interface";

import { checkAuth } from "../../middlewares/checkAuth";
import { Permission } from "../user/permissions/permissions.constant";

const router = Router();

router.get(
  "/summary",
  checkAuth(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
  ),
  TeamSalaryControllers.getSalarySummary,
);

router.post(
  "/generate",
  checkAuth(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
  ),
  TeamSalaryControllers.generateMonthlySalary,
);

router.patch(
  "/:id",
  checkAuth(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
  ),
  TeamSalaryControllers.updateTeamSalary,
);

router.post(
  "/",
  checkAuth(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
  ),
  TeamSalaryControllers.createTeamSalary,
);

router.get(
  "/",
  checkAuth(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
  ),
  TeamSalaryControllers.getTeamSalaries,
);

// Must be declared BEFORE "/:id"
router.get(
  "/my-salaries",
  checkAuth(
    Role.MANAGER,
    Role.DEVELOPER,
    Role.DESIGNER,
    Role.MARKETER,
    Role.STAFF,
  ),
  TeamSalaryControllers.getMySalaries,
);

router.get(
  "/user/:userId",
  checkAuth(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
  ),
  TeamSalaryControllers.getUserSalaryHistory,
);

router.post(
  "/:id/payment",
  checkAuth(
    Role.SUPER_ADMIN,
    Role.ADMIN,
  ),
  TeamSalaryControllers.createSalaryPayment,
);

router.patch(
  "/:id/cancel",
  checkAuth(
    Role.SUPER_ADMIN,
    Role.ADMIN,
  ),
  TeamSalaryControllers.cancelTeamSalary,
);

router.delete(
  "/:id",
  checkAuth(Role.ADMIN, Role.SUPER_ADMIN),
  TeamSalaryControllers.deleteTeamSalary,
);


router.get(
  "/:id",
  checkAuth(
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.MANAGER,
  ),
  TeamSalaryControllers.getTeamSalaryById,
);


export const TeamSalaryRoutes = router;