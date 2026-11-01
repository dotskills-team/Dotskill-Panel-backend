import { StatusCodes } from "http-status-codes";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { FinanceActor } from "../../utils/financeScope";
import { DashboardService } from "./dashboard.service";

const getOverview = catchAsync(async (req, res) => {
  const result = await DashboardService.getOverview(
    req.user as FinanceActor,
    req.query as Record<string, unknown>,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Dashboard overview retrieved successfully",
    data: result,
  });
});

export const DashboardController = { getOverview };
