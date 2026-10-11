import { StatusCodes } from "http-status-codes";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { TransactionService } from "./transaction.service";

const deposit = catchAsync(async (req, res) => {
  const result = await TransactionService.deposit(req.body, req.user.userId);
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Money added successfully",
    data: result,
  });
});

const getAllTransactions = catchAsync(async (req, res) => {
  const { result, meta } = await TransactionService.getAllTransactions(
    req.query,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Transactions retrieved successfully",
    meta,
    data: result,
  });
});

export const TransactionController = { deposit, getAllTransactions };