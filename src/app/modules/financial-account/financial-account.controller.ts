import { StatusCodes } from "http-status-codes";
// import catchAsync from "../../utils/catchAsync";
// import sendResponse from "../../utils/sendResponse";
import { FinancialAccountService } from "./financial-account.service";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";

const createFinancialAccount = catchAsync(async (req, res) => {
  const result = await FinancialAccountService.createFinancialAccount(
    req.body,
    req.user.userId,
  );

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Financial account created successfully",
    data: result,
  });
});

const getAllFinancialAccounts = catchAsync(async (req, res) => {
  const { result, meta } = await FinancialAccountService.getAllFinancialAccounts(
    req.query,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Financial accounts retrieved successfully",
    meta,
    data: result,
  });
});

const getSingleFinancialAccount = catchAsync(async (req, res) => {
      const { id } = req.params;

if (typeof id !== "string") {
  throw new Error("Invalid expense ID");
}
  const result = await FinancialAccountService.getSingleFinancialAccount(
    id,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Financial account retrieved successfully",
    data: result,
  });
});

const updateFinancialAccount = catchAsync(async (req, res) => {
      const { id } = req.params;

if (typeof id !== "string") {
  throw new Error("Invalid expense ID");
}
  const result = await FinancialAccountService.updateFinancialAccount(
    id,
    req.body,
    req.user.userId,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Financial account updated successfully",
    data: result,
  });
});

const deleteFinancialAccount = catchAsync(async (req, res) => {
      const { id } = req.params;

if (typeof id !== "string") {
  throw new Error("Invalid expense ID");
}
  const result = await FinancialAccountService.deleteFinancialAccount(
    id,
    req.user.userId,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Financial account deleted successfully",
    data: result,
  });
});

export const FinancialAccountController = {
  createFinancialAccount,
  getAllFinancialAccounts,
  getSingleFinancialAccount,
  updateFinancialAccount,
  deleteFinancialAccount,
};