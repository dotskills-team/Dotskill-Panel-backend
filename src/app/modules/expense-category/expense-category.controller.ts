import { StatusCodes } from "http-status-codes";
// import catchAsync from "../../utils/catchAsync";
// import sendResponse from "../../utils/sendResponse";
import { ExpenseCategoryService } from "./expense-category.service";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";

const createExpenseCategory = catchAsync(async (req, res) => {
  const result = await ExpenseCategoryService.createExpenseCategory(
    req.body,
    req.user.userId,
  );

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Expense category created successfully",
    data: result,
  });
});

const getAllExpenseCategories = catchAsync(async (req, res) => {
  const { result, meta } = await ExpenseCategoryService.getAllExpenseCategories(
    req.query,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Expense categories retrieved successfully",
    meta,
    data: result,
  });
});

const getSingleExpenseCategory = catchAsync(async (req, res) => {
      const { id } = req.params;

if (typeof id !== "string") {
  throw new Error("Invalid expense ID");
}
  const result = await ExpenseCategoryService.getSingleExpenseCategory(
    id,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Expense category retrieved successfully",
    data: result,
  });
});

const updateExpenseCategory = catchAsync(async (req, res) => {
     const { id } = req.params;

if (typeof id !== "string") {
  throw new Error("Invalid expense ID");
}
  const result = await ExpenseCategoryService.updateExpenseCategory(
    id,
    req.body,
    req.user.userId,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Expense category updated successfully",
    data: result,
  });
});

const deleteExpenseCategory = catchAsync(async (req, res) => {
    const { id } = req.params;

if (typeof id !== "string") {
  throw new Error("Invalid expense ID");
}
  const result = await ExpenseCategoryService.deleteExpenseCategory(
    
   id,
    req.user.userId,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Expense category deleted successfully",
    data: result,
  });
});

export const ExpenseCategoryController = {
  createExpenseCategory,
  getAllExpenseCategories,
  getSingleExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
};