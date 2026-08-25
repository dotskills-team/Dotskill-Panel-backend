import httpStatus from "http-status-codes";
import { Request, Response } from "express";

import { TeamSalaryServices } from "./team-salary.service";
import { sendResponse } from "../../utils/sendResponse";
import { catchAsync } from "../../utils/catchAsync";
import {
  createSalaryPaymentSchema,
  createTeamSalarySchema,
  generateMonthlySalarySchema,
  cancelTeamSalarySchema,
} from "./team-salary.validation";

const createTeamSalary = catchAsync(
  async (req: Request, res: Response) => {
    const payload = createTeamSalarySchema.parse(req.body);

    const result =
      await TeamSalaryServices.createTeamSalary(
        payload,
        req.user,
      );

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Team salary record created successfully.",
      data: result.data,
    });
  },
);

const generateMonthlySalary = catchAsync(
  async (req: Request, res: Response) => {
    const payload =
      generateMonthlySalarySchema.parse(req.body);

    const result =
      await TeamSalaryServices.generateMonthlySalary(
        payload,
        req.user,
      );

    const meta: any = "meta" in result ? result.meta : result.summary;

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Monthly team salary generated successfully.",
      data: result.data,
      meta
    });
  },
);

const getTeamSalaries = catchAsync(
  async (req: Request, res: Response) => {
    const result =
      await TeamSalaryServices.getTeamSalaries(
        req.query as Record<string, string>,
      );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Team salaries retrieved successfully.",
      data: result.data,
      meta: result.meta,
    });
  },
);

const getTeamSalaryById = catchAsync(
  async (req: Request, res: Response) => {
    const result =
      await TeamSalaryServices.getTeamSalaryById(
        req.params.id as string,
      );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Team salary retrieved successfully.",
      data: result.data,
    });
  },
);


const getUserSalaryHistory = catchAsync(
  async (req: Request, res: Response) => {
    const result =
      await TeamSalaryServices.getUserSalaryHistory(
        req.params.userId as string,
        req.query as Record<string, string>,
      );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Employee salary history retrieved successfully.",
      data: result.data,
      meta: result.meta,
    });
  },
);

const createSalaryPayment = catchAsync(
  async (req: Request, res: Response) => {
    const payload =
      createSalaryPaymentSchema.parse(req.body);

    const result =
      await TeamSalaryServices.createSalaryPayment(
        req.params.id as string,
        payload,
        req.user,
      );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Salary payment recorded successfully.",
      data: result.data,
    });
  },
);

const deleteTeamSalary = catchAsync(async (req, res) => {
  const { id } = req.params;

  await TeamSalaryServices.deleteTeamSalary(id as string);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Salary record deleted successfully",
    data: null,
  });
});

const cancelTeamSalary = catchAsync(
  async (req: Request, res: Response) => {
    const payload =
      cancelTeamSalarySchema.parse(req.body);

    const result =
      await TeamSalaryServices.cancelTeamSalary(
        req.params.id as string,
        payload.reason,
        req.user,
      );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Team salary cancelled successfully.",
      data: result.data,
    });
  },
);

const getSalarySummary = catchAsync(
  async (req: Request, res: Response) => {
    const result =
      await TeamSalaryServices.getSalarySummary(
        req.query as Record<string, string>,
      );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Salary summary retrieved successfully.",
      data: result.data,
    });
  },
);


export const TeamSalaryControllers = {
  createTeamSalary,
  generateMonthlySalary,

  getTeamSalaries,
  getTeamSalaryById,
  getUserSalaryHistory,
deleteTeamSalary,
  createSalaryPayment,

  cancelTeamSalary,

  getSalarySummary,
};