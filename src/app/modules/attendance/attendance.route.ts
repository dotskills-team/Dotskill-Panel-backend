import { Router } from "express";
import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";
import { validateQuery } from "../../middlewares/validateQuery";
import { Role } from "../user/user.interface";
import { AttendanceController } from "./attendance.controller";
import {
  createAttendanceZodSchema,
  listAttendanceQuerySchema,
  monthQuerySchema,
  summaryQuerySchema,
  updateAttendanceZodSchema,
} from "./attendance.validation";

const router = Router();

const everyone = checkAuth(...Object.values(Role));
const managers = checkAuth(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER);

/* ------------------------------ staff actions ----------------------------- */

router.post("/check-in", everyone, AttendanceController.checkIn);
router.post("/check-out", everyone, AttendanceController.checkOut);
router.post("/break/start", everyone, AttendanceController.startBreak);
router.post("/break/end", everyone, AttendanceController.endBreak);

router.get("/me/today", everyone, AttendanceController.getToday);
router.get("/me", everyone, validateQuery(monthQuerySchema), AttendanceController.getMyMonth);

/* --------------------------- admin / manager only -------------------------- */

router.get("/summary", managers, validateQuery(summaryQuerySchema), AttendanceController.getSummary);

router.get("/", managers, validateQuery(listAttendanceQuerySchema), AttendanceController.list);

router.post("/", managers, validateRequest(createAttendanceZodSchema), AttendanceController.create);

router.patch("/:id", managers, validateRequest(updateAttendanceZodSchema), AttendanceController.update);

export const AttendanceRoutes = router;
