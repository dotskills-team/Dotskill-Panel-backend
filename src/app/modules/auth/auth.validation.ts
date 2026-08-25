import { z } from "zod";

export const changePasswordZodSchema = z.object({
  oldPassword: z.string({ invalid_type_error: "Password must be string" }),
  newPassword: z
    .string({ invalid_type_error: "Password must be string" })
    .min(8, { message: "Password must be at least 8 characters long." }),
});

export const forgotPasswordZodSchema = z.object({
  body: z.object({
    email: z.string().email(),
  }),
});

export const resetPasswordZodSchema = z.object({
  body: z.object({
    token: z.string().min(1),
    newPassword: z.string().min(6),
  }),
});
