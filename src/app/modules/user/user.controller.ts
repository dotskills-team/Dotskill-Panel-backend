import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";

import { UserServices } from "./user.service";
import { IUser, Role, UserStatus } from "./user.interface";
import { sendResponse } from "../../utils/sendResponse";
import { catchAsync } from "../../utils/catchAsync";
import AppError from "../../errorHelpers/appError";
import { Permission } from "./permissions/permissions.constant";

const createUser = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const decodedToken = req.user as JwtPayload | undefined;

    const result = await UserServices.createUserService(
      req.body as Partial<IUser>,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "User created successfully.",
      data: result.data,
    });
  },
);

const getUsers = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const result = await UserServices.getUsers(
      req.query as Record<string, string>,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Users retrieved successfully.",
      data: result.data,
      meta: result.meta,
    });
  },
);

const getDeletedUsers = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const result = await UserServices.getDeletedUsers(
      req.query as Record<string, string>,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Deleted users retrieved successfully.",
      data: result.data,
      meta: result.meta,
    });
  },
);

const getUserById = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.params.id as string;

    const result = await UserServices.getUserById(userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "User retrieved successfully.",
      data: result.data,
    });
  },
);

const getMe = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const decodedToken = req.user as JwtPayload;

    const result = await UserServices.getMe(decodedToken.userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Your profile retrieved successfully.",
      data: result.data,
    });
  },
);

const updateUser = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.params.id as string;
    const decodedToken = req.user as JwtPayload;

    const payload: Partial<IUser> = {
      ...req.body,
      ...(req.file?.path ? { avatar: req.file.path } : {}),
    };

    const result = await UserServices.updateUser(userId, payload, decodedToken);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "User updated successfully.",
      data: result.data,
    });
  },
);

const updateProfile = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const decodedToken = req.user as JwtPayload;

    const payload: Partial<IUser> = {
      ...req.body,
      ...(req.file?.path ? { avatar: req.file.path } : {}),
    };

    const result = await UserServices.updateProfile(payload, decodedToken);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Profile updated successfully.",
      data: result.data,
    });
  },
);

const updateUserRole = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.params.id as string;
    const decodedToken = req.user as JwtPayload;
    const { role } = req.body as { role: Role };

    const result = await UserServices.updateUserRole(
      userId,
      role,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "User role updated successfully.",
      data: result.data,
    });
  },
);

const updateUserStatus = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.params.id as string;
    const decodedToken = req.user as JwtPayload;
    const { status } = req.body as { status: UserStatus };

    const result = await UserServices.updateUserStatus(
      userId,
      status,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "User status updated successfully.",
      data: result.data,
    });
  },
);

const updateUserPermissions = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.params.id as string;
    const decodedToken = req.user as JwtPayload;
    const { permissions } = req.body as { permissions: Permission[] };

    const result = await UserServices.updateUserPermissions(
      userId,
      permissions,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "User permissions updated successfully.",
      data: result.data,
    });
  },
);

const changePassword = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const decodedToken = req.user as JwtPayload;
    const { oldPassword, newPassword } = req.body as {
      oldPassword: string;
      newPassword: string;
    };

    if (!oldPassword || !newPassword) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Old password and new password are required.",
      );
    }

    const result = await UserServices.changePassword(
      decodedToken.userId,
      oldPassword,
      newPassword,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Password changed successfully.",
      data: result.data,
    });
  },
);

const softDeleteUser = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.params.id as string;
    const decodedToken = req.user as JwtPayload;

    const result = await UserServices.softDeleteUser(userId, decodedToken);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "User moved to trash successfully.",
      data: result.data,
    });
  },
);

const restoreUser = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.params.id as string;
    const decodedToken = req.user as JwtPayload;

    const result = await UserServices.restoreUser(userId, decodedToken);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "User restored successfully.",
      data: result.data,
    });
  },
);

const permanentlyDeleteUser = catchAsync(
  async (req: Request, res: Response, _next: NextFunction) => {
    const userId = req.params.id as string;
    const decodedToken = req.user as JwtPayload;

    const result = await UserServices.permanentlyDeleteUser(
      userId,
      decodedToken,
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "User permanently deleted successfully.",
      data: result.data,
    });
  },
);

export const UserControllers = {
  createUser,
  getUsers,
  getDeletedUsers,
  getUserById,
  getMe,
  updateUser,
  updateProfile,
  updateUserRole,
  updateUserStatus,
  updateUserPermissions,
  changePassword,
  softDeleteUser,
  restoreUser,
  permanentlyDeleteUser,
};