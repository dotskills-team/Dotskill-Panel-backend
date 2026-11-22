import { z } from "zod";
import { AI_WORKSPACE } from "./ai.constant";

export const aiChatZodSchema = z.object({
  message: z
    .string({ required_error: "Message is required" })
    .trim()
    .min(1, "Message cannot be empty")
    .max(4000, "Message must be at most 4000 characters"),
  workspace: z.enum([AI_WORKSPACE.BUSINESS, AI_WORKSPACE.PERSONAL], {
    required_error: "Workspace is required",
  }),
  conversationId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid conversation id")
    .optional(),
});
