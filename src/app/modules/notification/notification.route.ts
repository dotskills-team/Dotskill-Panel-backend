import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import AppError from "../../errorHelpers/appError";
import { checkAuth } from "../../middlewares/checkAuth";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { Role } from "../user/user.interface";
import { NotificationService } from "./notification.service";

const router = Router();
const everyone = checkAuth(...Object.values(Role));

router.get(
  "/",
  everyone,
  catchAsync(async (req, res) => {
    const data = await NotificationService.listForUser(req.user.userId);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Notifications retrieved",
      data,
    });
  }),
);

// Must stay above "/:id/read" so "read-all" is not treated as an id.
router.patch(
  "/read-all",
  everyone,
  catchAsync(async (req, res) => {
    await NotificationService.markAllRead(req.user.userId);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "All notifications marked as read",
      data: null,
    });
  }),
);

router.patch(
  "/:id/read",
  everyone,
  catchAsync(async (req, res) => {
    const id = req.params.id;
    if (typeof id !== "string" || !/^[0-9a-fA-F]{24}$/.test(id)) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Invalid id");
    }
    await NotificationService.markRead(id, req.user.userId);
    sendResponse(res, {
      statusCode: StatusCodes.OK,
      success: true,
      message: "Notification marked as read",
      data: null,
    });
  }),
);

export const NotificationRoutes = router;
