import { StatusCodes } from "http-status-codes";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AiService } from "./ai.service";

const chat = catchAsync(async (req, res) => {
  const result = await AiService.chat(req.user, req.body);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "AI reply generated successfully",
    data: result,
  });
});

export const AiController = { chat };
