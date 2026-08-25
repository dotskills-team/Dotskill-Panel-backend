import { z } from "zod";
import { Gender, PaymentMethod, Role, UserStatus } from "./user.interface";
import { PERMISSIONS, Permission } from "./permissions/permissions.constant";
import { Types } from "mongoose";

const roleValues = Object.values(Role) as [Role, ...Role[]];
const statusValues = Object.values(UserStatus) as [UserStatus, ...UserStatus[]];
const permissionValues = Object.values(PERMISSIONS) as [
  Permission,
  ...Permission[],
];

export const emailSchema = z
  .string({ invalid_type_error: "Email must be a string." })
  .trim()
  .toLowerCase()
  .email({ message: "Invalid email address format." })
  .min(5, { message: "Email must be at least 5 characters long." })
  .max(100, { message: "Email cannot exceed 100 characters." });

export const passwordSchema = z
  .string({ invalid_type_error: "Password must be a string." })
  .min(8, { message: "Password must be at least 8 characters long." })
  .max(128, { message: "Password cannot exceed 128 characters." })
  .regex(/^(?=.*[A-Z])/, {
    message: "Password must contain at least 1 uppercase letter.",
  })
  .regex(/^(?=.*[a-z])/, {
    message: "Password must contain at least 1 lowercase letter.",
  })
  .regex(/^(?=.*\d)/, {
    message: "Password must contain at least 1 number.",
  });

export const phoneSchema = z
  .string({ invalid_type_error: "Phone number must be a string." })
  .regex(/^(?:\+880|0)[1-9]\d{7,9}$/, {
    message:
      "Phone number must be valid for Bangladesh. Format: +88XXXXXXXXX or 0XXXXXXXXX",
  });

const genderValues = Object.values(Gender) as [Gender, ...Gender[]];

const paymentMethodValues = Object.values(PaymentMethod) as [
  PaymentMethod,
  ...PaymentMethod[],
];

export const objectIdSchema = z
  .string({ invalid_type_error: "Id must be a string." })
  .refine((val) => Types.ObjectId.isValid(val), {
    message: "Invalid MongoDB ObjectId.",
  });

const nameSchema = (fieldName: string) =>
  z
    .string({ invalid_type_error: `${fieldName} must be a string.` })
    .trim()
    .min(2, { message: `${fieldName} must be at least 2 characters long.` })
    .max(50, { message: `${fieldName} cannot exceed 50 characters.` });

export const createUserValidationSchema = z
  .object({
    firstName: nameSchema("First name"),
    lastName: nameSchema("Last name"),
    email: emailSchema,
    password: passwordSchema,
    phone: phoneSchema.optional(),
    gender: z.enum(genderValues).optional(),

    dateOfBirth: z.coerce.date().optional(),

    salary: z.coerce
      .number({
        invalid_type_error: "Salary must be a number.",
      })
      .min(0, "Salary cannot be negative.")
      .optional(),

    paymentMethod: z.enum(paymentMethodValues).optional(),

    paymentAccount: z
      .object({
        accountHolderName: z.string().trim().min(2).max(100),

        accountNumber: z.string().trim().min(5).max(50),
      })
      .optional(),

    bankAccount: z
      .object({
        accountHolderName: z.string().trim().min(2).max(100),

        accountNumber: z.string().trim().min(5).max(50),

        bankName: z.string().trim().min(2).max(100),

        branchName: z.string().trim().max(100).optional(),

        routingNumber: z.string().trim().max(50).optional(),
      })
      .optional(),
    avatar: z
      .string()

      .optional(),
    address: z
      .string()
      .trim()
      .max(200, { message: "Address cannot exceed 200 characters." })
      .optional(),
    bio: z
      .string()
      .trim()
      .max(500, { message: "Bio cannot exceed 500 characters." })
      .optional(),
    role: z
      .enum(roleValues, {
        invalid_type_error: `Role must be one of: ${roleValues.join(", ")}`,
      })
      .optional(),
    designation: z.string().trim().max(100).optional(),
    department: z.string().trim().max(100).optional(),
    joiningDate: z.coerce.date().optional(),
    reportingManager: objectIdSchema.optional(),
  })
  .strict();

export const updateUserValidationSchema = z
  .object({
    firstName: nameSchema("First name").optional(),
    lastName: nameSchema("Last name").optional(),
    phone: phoneSchema.optional(),
    avatar: z
      .string()

      .optional(),
    role: z.nativeEnum(Role).optional(),
    address: z
      .string()
      .trim()
      .max(200, { message: "Address cannot exceed 200 characters." })
      .optional(),
    gender: z.enum(genderValues).optional(),

    dateOfBirth: z.coerce.date().optional(),

    salary: z.coerce
      .number({
        invalid_type_error: "Salary must be a number.",
      })
      .min(0, "Salary cannot be negative.")
      .optional(),

    paymentMethod: z.enum(paymentMethodValues).optional(),

    paymentAccount: z
      .object({
        accountHolderName: z.string().trim().min(2).max(100),

        accountNumber: z.string().trim().min(5).max(50),
      })
      .optional(),

    bankAccount: z
      .object({
        accountHolderName: z.string().trim().min(2).max(100),

        accountNumber: z.string().trim().min(5).max(50),

        bankName: z.string().trim().min(2).max(100),

        branchName: z.string().trim().max(100).optional(),

        routingNumber: z.string().trim().max(50).optional(),
      })
      .optional(),
    bio: z
      .string()
      .trim()
      .max(500, { message: "Bio cannot exceed 500 characters." })
      .optional(),
    designation: z.string().trim().max(100).optional(),
    department: z.string().trim().max(100).optional(),
    joiningDate: z.coerce.date().optional(),
    reportingManager: objectIdSchema.optional(),
  })
  .strict();

export const updateProfileValidationSchema = z
  .object({
    firstName: nameSchema("First name").optional(),
    lastName: nameSchema("Last name").optional(),
    phone: phoneSchema.optional(),
    avatar: z
      .string()
      .url({ message: "Avatar must be a valid URL." })
      .optional(),
    address: z
      .string()
      .trim()
      .max(200, { message: "Address cannot exceed 200 characters." })
      .optional(),
    bio: z
      .string()
      .trim()
      .max(500, { message: "Bio cannot exceed 500 characters." })
      .optional(),
  })
  .strict();

export const changePasswordValidationSchema = z
  .object({
    oldPassword: z.string({
      invalid_type_error: "Old password must be a string.",
    }),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((data) => data.oldPassword !== data.newPassword, {
    message: "New password must be different from the old password.",
    path: ["newPassword"],
  });

export const updateRoleValidationSchema = z
  .object({
    role: z.enum(roleValues, {
      required_error: "Role is required.",
      invalid_type_error: `Role must be one of: ${roleValues.join(", ")}`,
    }),
  })
  .strict();

export const updateStatusValidationSchema = z
  .object({
    status: z.enum(statusValues, {
      required_error: "Status is required.",
      invalid_type_error: `Status must be one of: ${statusValues.join(", ")}`,
    }),
  })
  .strict();

export const updatePermissionsValidationSchema = z
  .object({
    permissions: z.array(
      z.enum(permissionValues, {
        invalid_type_error: "Invalid permission value.",
      }),
    ),
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserValidationSchema>;
export type UpdateUserInput = z.infer<typeof updateUserValidationSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileValidationSchema>;
export type ChangePasswordInput = z.infer<
  typeof changePasswordValidationSchema
>;
export type UpdateRoleInput = z.infer<typeof updateRoleValidationSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusValidationSchema>;
export type UpdatePermissionsInput = z.infer<
  typeof updatePermissionsValidationSchema
>;
