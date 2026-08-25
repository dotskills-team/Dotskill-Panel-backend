import httpStatus from "http-status-codes";
import { NextFunction, Request, Response } from "express";
import { JwtPayload } from "jsonwebtoken";

import { envVars } from "../config/env";
import AppError from "../errorHelpers/appError";
import { UserStatus } from "../modules/user/user.interface";
import { verifyToken } from "../utils/jwt";
import { User } from "../modules/user/user.model";

export const checkAuth =
  (...authRoles: string[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      let accessToken: string | undefined;

      const authorization = req.headers.authorization;

      if (authorization?.startsWith("Bearer ")) {
        accessToken = authorization.split(" ")[1];
      } else {
        accessToken = req.cookies?.accessToken;
      }

      if (!accessToken) {
        throw new AppError(
          httpStatus.UNAUTHORIZED,
          "Authentication token is required.",
        );
      }

      const verifiedToken = verifyToken(
        accessToken,
        envVars.JWT_ACCESS_SECRET,
      ) as JwtPayload;

      const user = await User.findOne({
        email: verifiedToken.email,
      }).select("_id email role status isDeleted passwordChangedAt");

      if (!user) {
        throw new AppError(httpStatus.UNAUTHORIZED, "Authentication failed.");
      }

      if (user.isDeleted) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          "Your account has been deleted.",
        );
      }

      if (user.status !== UserStatus.ACTIVE) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          `Your account is ${user.status.toLowerCase()}. Please contact the administrator.`,
        );
      }

      if (authRoles.length > 0 && !authRoles.includes(verifiedToken.role)) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          "You do not have permission to access this resource.",
        );
      }

      req.user = verifiedToken;

      next();
    } catch (error) {
      next(error);
    }
  };
