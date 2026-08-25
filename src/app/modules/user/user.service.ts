import httpStatus from "http-status-codes";
import bcryptjs from "bcryptjs";
import { Types } from "mongoose";
import { JwtPayload } from "jsonwebtoken";

import { IUser, Role, UserStatus } from "./user.interface";
import { User } from "./user.model";
import { userSearchableFields } from "./user.constants";
import AppError from "../../errorHelpers/appError";
import { envVars } from "../../config/env";
import { QueryBuilder } from "../../utils/QueryBuilder";
import {
  DEFAULT_ROLE_PERMISSIONS,
  Permission,
} from "./permissions/permissions.constant";

const PROTECTED_FIELDS: (keyof IUser | string)[] = [
  "password",
  "permissions",
  "status",
  "isVerified",
  "isDeleted",
  "deletedAt",
  "deletedBy",
  "createdBy",
  "updatedBy",
  "lastLogin",
  "passwordChangedAt",
  "email",
  "_id",
];

const stripProtectedFields = <T extends Record<string, any>>(
  payload: T,
): Partial<T> => {
  const sanitized: Record<string, any> = { ...payload };
  PROTECTED_FIELDS.forEach((field) => {
    delete sanitized[field as string];
  });
  return sanitized as Partial<T>;
};

const toObjectId = (id: string) => new Types.ObjectId(id);

const assertValidObjectId = (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid user id.");
  }
};

const assertUserExists = async (userId: string) => {
  assertValidObjectId(userId);

  const user = await User.findOne({ _id: userId, isDeleted: false });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }

  return user;
};

const countActiveSuperAdmins = async (excludeUserId: string) => {
  return User.countDocuments({
    role: Role.SUPER_ADMIN,
    isDeleted: false,
    status: UserStatus.ACTIVE,
    _id: { $ne: toObjectId(excludeUserId) },
  });
};

const buildDateFilter = (query: Record<string, string>) => {
  const dateFilter: Record<string, Date> = {};

  if (query["createdAt[gte]"]) {
    dateFilter.$gte = new Date(query["createdAt[gte]"]) as unknown as Date;
  }

  if (query["createdAt[lte]"]) {
    dateFilter.$lte = new Date(query["createdAt[lte]"]) as unknown as Date;
  }

  return Object.keys(dateFilter).length ? dateFilter : undefined;
};

const sanitizeQuery = (query: Record<string, string>) => {
  const sanitized = { ...query };
  delete sanitized["createdAt[gte]"];
  delete sanitized["createdAt[lte]"];
  return sanitized;
};

const createUserService = async (
  payload: Partial<IUser>,
  decodedToken?: JwtPayload,
) => {
  const { email, password, role, ...rest } = payload;

  if (!email || !password) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Email and password are required.",
    );
  }

  const normalizedEmail = email.toLowerCase().trim();

  const isExistUser = await User.findOne({ email: normalizedEmail });

  if (isExistUser) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A user already exists with this email.",
    );
  }

  const hashedPassword = await bcryptjs.hash(
    password,
    Number(envVars.BCRYPT_SALT_ROUND),
  );

  const assignedRole = role ?? Role.STAFF;

  const user = await User.create({
    ...rest,
    email: normalizedEmail,
    password: hashedPassword,
    role: assignedRole,
    permissions: DEFAULT_ROLE_PERMISSIONS[assignedRole] ?? [],
    passwordChangedAt: new Date(),
    createdBy: decodedToken?.userId
      ? toObjectId(decodedToken.userId)
      : undefined,
  });

  const userObj = user.toObject();
  delete userObj.password;

  return { data: userObj };
};

const getUsers = async (query: Record<string, string>) => {
  const dateFilter = buildDateFilter(query);

  const baseFilter: Record<string, any> = { isDeleted: false };

  if (dateFilter) {
    baseFilter.createdAt = dateFilter;
  }

  const queryBuilder = new QueryBuilder(
    User.find(baseFilter),
    sanitizeQuery(query),
  );

  const usersQuery = queryBuilder
    .filter()
    .search(userSearchableFields)
    .sort()
    .fields()
    .paginate();

  const [data, meta] = await Promise.all([
    usersQuery.build(),
    queryBuilder.getMeta(),
  ]);

  return { data, meta };
};

const getDeletedUsers = async (query: Record<string, string>) => {
  const dateFilter = buildDateFilter(query);

  const baseFilter: Record<string, any> = { isDeleted: true };

  if (dateFilter) {
    baseFilter.createdAt = dateFilter;
  }

  const queryBuilder = new QueryBuilder(
    User.find(baseFilter),
    sanitizeQuery(query),
  );

  const usersQuery = queryBuilder
    .filter()
    .search(userSearchableFields)
    .sort()
    .fields()
    .paginate();

  const [data, meta] = await Promise.all([
    usersQuery.build(),
    queryBuilder.getMeta(),
  ]);

  return { data, meta };
};

const getUserById = async (id: string) => {
  assertValidObjectId(id);

  const user = await User.findOne({ _id: id, isDeleted: false }).populate(
    "reportingManager",
    "firstName lastName email designation",
  );

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }

  return { data: user };
};

const getMe = async (userId: string) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).populate(
    "reportingManager",
    "firstName lastName email designation",
  );

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }

  return { data: user };
};

const updateUser = async (
  userId: string,
  payload: Partial<IUser>,
  decodedToken: JwtPayload,
) => {
  await assertUserExists(userId);

  if (payload.role && decodedToken.role !== Role.SUPER_ADMIN) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only Super Admin can change roles.",
    );
  }

  const sanitizedPayload = stripProtectedFields(payload);

  if (sanitizedPayload.paymentMethod === "CASH") {
    sanitizedPayload.paymentAccount = undefined;
    sanitizedPayload.bankAccount = undefined;
  }

  if (
    sanitizedPayload.paymentMethod === "BKASH" ||
    sanitizedPayload.paymentMethod === "NAGAD"
  ) {
    sanitizedPayload.bankAccount = undefined;
  }

  if (sanitizedPayload.paymentMethod === "BANK") {
    sanitizedPayload.paymentAccount = undefined;
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        ...sanitizedPayload,
        updatedBy: toObjectId(decodedToken.userId),
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  );

  return { data: updatedUser };
};

const updateProfile = async (
  payload: Partial<IUser>,
  decodedToken: JwtPayload,
) => {
  await assertUserExists(decodedToken.userId);

  const sanitizedPayload = stripProtectedFields(payload);

  const updatedUser = await User.findByIdAndUpdate(
    decodedToken.userId,
    {
      ...sanitizedPayload,
      updatedBy: toObjectId(decodedToken.userId),
    },
    { new: true, runValidators: true },
  );

  return { data: updatedUser };
};

const updateUserRole = async (
  userId: string,
  role: Role,
  decodedToken: JwtPayload,
) => {
  const user = await assertUserExists(userId);

  if (user.role === Role.SUPER_ADMIN && role !== Role.SUPER_ADMIN) {
    const remainingSuperAdmins = await countActiveSuperAdmins(userId);

    if (remainingSuperAdmins === 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Cannot change role. At least one Super Admin must remain in the system.",
      );
    }
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      role,
      permissions: DEFAULT_ROLE_PERMISSIONS[role] ?? [],
      updatedBy: toObjectId(decodedToken.userId),
    },
    { new: true, runValidators: true },
  );

  return { data: updatedUser };
};

const updateUserStatus = async (
  userId: string,
  status: UserStatus,
  decodedToken: JwtPayload,
) => {
  const user = await assertUserExists(userId);

  if (userId === decodedToken.userId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You cannot change the status of your own account.",
    );
  }

  if (user.role === Role.SUPER_ADMIN && status !== UserStatus.ACTIVE) {
    const remainingSuperAdmins = await countActiveSuperAdmins(userId);

    if (remainingSuperAdmins === 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Cannot deactivate the last active Super Admin.",
      );
    }
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      status,
      updatedBy: toObjectId(decodedToken.userId),
    },
    { new: true, runValidators: true },
  );

  return { data: updatedUser };
};

const updateUserPermissions = async (
  userId: string,
  permissions: Permission[],
  decodedToken: JwtPayload,
) => {
  await assertUserExists(userId);

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      permissions,
      updatedBy: toObjectId(decodedToken.userId),
    },
    { new: true, runValidators: true },
  );

  return { data: updatedUser };
};

const changePassword = async (
  userId: string,
  oldPassword: string,
  newPassword: string,
) => {
  const user = await User.findOne({ _id: userId, isDeleted: false }).select(
    "+password",
  );

  if (!user || !user.password) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found.");
  }

  const isPasswordMatched = await bcryptjs.compare(oldPassword, user.password);

  if (!isPasswordMatched) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Old password is incorrect.");
  }

  const hashedPassword = await bcryptjs.hash(
    newPassword,
    Number(envVars.BCRYPT_SALT_ROUND),
  );

  user.password = hashedPassword;
  user.passwordChangedAt = new Date();

  await user.save();

  return { data: null };
};

const updateLastLogin = async (userId: string) => {
  await User.findByIdAndUpdate(userId, { lastLogin: new Date() });
};

const softDeleteUser = async (userId: string, decodedToken: JwtPayload) => {
  const user = await assertUserExists(userId);

  if (userId === decodedToken.userId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You cannot delete your own account.",
    );
  }

  if (user.role === Role.SUPER_ADMIN) {
    const remainingSuperAdmins = await countActiveSuperAdmins(userId);

    if (remainingSuperAdmins === 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Cannot delete the last Super Admin.",
      );
    }
  }

  await User.findByIdAndUpdate(userId, {
    isDeleted: true,
    deletedAt: new Date(),
    deletedBy: toObjectId(decodedToken.userId),
    status: UserStatus.INACTIVE,
  });

  return { data: null };
};

const restoreUser = async (userId: string, decodedToken: JwtPayload) => {
  assertValidObjectId(userId);

  const user = await User.findOne({ _id: userId, isDeleted: true });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "Deleted user not found.");
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      status: UserStatus.ACTIVE,
      updatedBy: toObjectId(decodedToken.userId),
    },
    { new: true },
  );

  return { data: updatedUser };
};

const permanentlyDeleteUser = async (
  userId: string,
  decodedToken: JwtPayload,
) => {
  if (decodedToken.role !== Role.SUPER_ADMIN) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only a Super Admin can permanently delete a user.",
    );
  }

  if (userId === decodedToken.userId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "You cannot permanently delete your own account.",
    );
  }

  assertValidObjectId(userId);

  const user = await User.findOne({ _id: userId, isDeleted: true });

  if (!user) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Only already soft-deleted users can be permanently deleted.",
    );
  }

  if (user.role === Role.SUPER_ADMIN) {
    const remainingSuperAdmins = await countActiveSuperAdmins(userId);

    if (remainingSuperAdmins === 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Cannot permanently delete the last Super Admin.",
      );
    }
  }

  await User.findByIdAndDelete(userId);

  return { data: null };
};

export const UserServices = {
  createUserService,

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
  updateLastLogin,
  softDeleteUser,
  restoreUser,
  permanentlyDeleteUser,
};
