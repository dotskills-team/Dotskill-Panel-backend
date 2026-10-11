import { StatusCodes } from "http-status-codes";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { LoanService } from "./loan.service";

const createLoan = catchAsync(async (req, res) => {
  const result = await LoanService.createLoan(req.body, req.user.userId);
  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Loan recorded successfully",
    data: result,
  });
});

const repayLoan = catchAsync(async (req, res) => {
  const result = await LoanService.repayLoan(
    req.params.id as string,
    req.body,
    req.user.userId,
  );
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Loan repayment recorded successfully",
    data: result,
  });
});

const getAllLoans = catchAsync(async (req, res) => {
  const { result, meta } = await LoanService.getAllLoans(req.query);
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Loans retrieved successfully",
    meta,
    data: result,
  });
});

const getLoanSummary = catchAsync(async (_req, res) => {
  const result = await LoanService.getLoanSummary();
  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Loan summary retrieved successfully",
    data: result,
  });
});

export const LoanController = {
  createLoan,
  repayLoan,
  getAllLoans,
  getLoanSummary,
};