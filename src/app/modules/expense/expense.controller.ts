import { StatusCodes } from "http-status-codes";
// import catchAsync from "../../utils/catchAsync";
// import sendResponse from "../../utils/sendResponse";
import { ExpenseService } from "./expense.service";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";

const createExpense = catchAsync(async (req, res) => {
  const payload = { ...req.body };
  if (req.file) {
    payload.attachment = req.file.path;
  }

  const result = await ExpenseService.createExpense(payload, req.user.userId);

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Expense created successfully",
    data: result,
  });
});

const getAllExpenses = catchAsync(async (req, res) => {
  const { result, meta } = await ExpenseService.getAllExpenses(req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Expenses retrieved successfully",
    meta,
    data: result,
  });
});

const getSingleExpense = catchAsync(async (req, res) => {
    const { id } = req.params;

if (typeof id !== "string") {
  throw new Error("Invalid expense ID");
}
  const result = await ExpenseService.getSingleExpense(id);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Expense retrieved successfully",
    data: result,
  });
});

const updateExpense = catchAsync(async (req, res) => {
  const payload = { ...req.body };
  if (req.file) {
    payload.attachment = req.file.path;
  }

  const { id } = req.params;

if (typeof id !== "string") {
  throw new Error("Invalid expense ID");
}

  const result = await ExpenseService.updateExpense(
    id,
    payload,
    req.user.userId,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Expense updated successfully",
    data: result,
  });
});

const deleteExpense = catchAsync(async (req, res) => {
    const { id } = req.params;

if (typeof id !== "string") {
  throw new Error("Invalid expense ID");
}
  const result = await ExpenseService.deleteExpense(id, req.user.userId);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Expense deleted successfully",
    data: result,
  });
});

export const ExpenseController = {
  createExpense,
  getAllExpenses,
  getSingleExpense,
  updateExpense,
  deleteExpense,
};