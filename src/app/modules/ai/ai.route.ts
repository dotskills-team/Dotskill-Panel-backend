import { Router } from "express";
import { checkAuth } from "../../middlewares/checkAuth";
import { validateRequest } from "../../middlewares/validateRequest";
import { Role } from "../user/user.interface";
import { AiController } from "./ai.controller";
import { aiRateLimit } from "./ai.rateLimit";
import { aiChatZodSchema } from "./ai.validation";

const router = Router();

// Every logged-in role may chat; what data it can see is decided per tool by role,
// and the personal workspace is admin-only (checked in the service).
router.post(
  "/chat",
  checkAuth(...Object.values(Role)),
  aiRateLimit,
  validateRequest(aiChatZodSchema),
  AiController.chat,
);

export const AiRoutes = router;
