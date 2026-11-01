import { Router } from "express";
import { checkAuth } from "../../middlewares/checkAuth";
import { Role } from "../user/user.interface";
import { DashboardController } from "./dashboard.controller";

const router = Router();

// Every logged-in role gets an overview; the service decides what each role sees.
router.get("/overview", checkAuth(...Object.values(Role)), DashboardController.getOverview);

export const DashboardRoutes = router;
