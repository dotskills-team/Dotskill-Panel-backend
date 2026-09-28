import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { FundTransferService } from "./fund-transfer.service";

const createFundTransfer = catchAsync(async (req: Request, res: Response) => {
  const result = await FundTransferService.createFundTransfer(
    req.body,
    req.user as JwtPayload,
  );

  sendResponse(res, {
    statusCode: StatusCodes.CREATED,
    success: true,
    message: "Fund transferred successfully",
    data: result.data,
  });
});

const getAllFundTransfers = catchAsync(async (req: Request, res: Response) => {
  const { result, meta } = await FundTransferService.getAllFundTransfers(req.query);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Fund transfers retrieved successfully",
    meta,
    data: result,
  });
});

const getSingleFundTransfer = catchAsync(async (req: Request, res: Response) => {
  const result = await FundTransferService.getSingleFundTransfer(req.params.id as string);

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Fund transfer retrieved successfully",
    data: result,
  });
});

const deleteFundTransfer = catchAsync(async (req: Request, res: Response) => {
  const result = await FundTransferService.deleteFundTransfer(
    req.params.id as string,
    req.user as JwtPayload,
  );

  sendResponse(res, {
    statusCode: StatusCodes.OK,
    success: true,
    message: "Fund transfer reversed and deleted successfully",
    data: result.data,
  });
});

export const FundTransferController = {
  createFundTransfer,
  getAllFundTransfers,
  getSingleFundTransfer,
  deleteFundTransfer,
};