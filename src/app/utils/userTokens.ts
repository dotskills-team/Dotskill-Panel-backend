import httpStatus from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";

import { envVars } from "../config/env";
import AppError from "../errorHelpers/appError";
import { generateToken, verifyToken } from "./jwt";
import { IUser, UserStatus } from "../modules/user/user.interface";
import { User } from "../modules/user/user.model";

export const createUserTokens = (user: Partial<IUser>) => {
  const tokenPayload = {
    userId: user._id,
    email: user.email,
    role: user.role,
  };

  return {
    accessToken: generateToken(
      tokenPayload,
      envVars.JWT_ACCESS_SECRET,
      envVars.JWT_ACCESS_EXPIRES,
    ),
    refreshToken: generateToken(
      tokenPayload,
      envVars.JWT_REFRESH_SECRET,
      envVars.JWT_REFRESH_EXPIRES,
    ),
  };
};

export const createNewAccessTokenWithRefreshToken = async (
  refreshToken: string,
) => {
  const decoded = verifyToken(
    refreshToken,
    envVars.JWT_REFRESH_SECRET,
  ) as JwtPayload;

  const user = await User.findOne({
    email: decoded.email,
    isDeleted: false,
  });

  if (!user) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Authentication failed.");
  }

  if (user.status !== UserStatus.ACTIVE) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      `Your account is ${user.status.toLowerCase()}.`,
    );
  }

  const tokenPayload = {
    userId: user._id,
    email: user.email,
    role: user.role,
  };

  return generateToken(
    tokenPayload,
    envVars.JWT_ACCESS_SECRET,
    envVars.JWT_ACCESS_EXPIRES,
  );
};
