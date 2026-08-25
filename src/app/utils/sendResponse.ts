import { Response } from "express";

interface TMeta {
  total: number;
}

interface TResponse<T, S = Record<string, number>> {
  statusCode: number;
  message: string;
  success: boolean;
  data: T;
  meta?: TMeta;
  stats?: S;
}

export const sendResponse = <T, S = Record<string, number>>(
  res: Response,
  data: TResponse<T, S>,
) => {
  res.status(data.statusCode).json({
    statusCode: data.statusCode,
    success: data.success,
    message: data.message,
    data: data.data,
    meta: data.meta,
    stats: data.stats,
  });
};