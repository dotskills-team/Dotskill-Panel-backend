import { Role } from "../user/user.interface";

export const AI_WORKSPACE = {
  BUSINESS: "business",
  PERSONAL: "personal",
} as const;

export type AiWorkspace = (typeof AI_WORKSPACE)[keyof typeof AI_WORKSPACE];

export const AI_MESSAGE_ROLE = {
  USER: "user",
  ASSISTANT: "assistant",
} as const;

export type AiMessageRole = (typeof AI_MESSAGE_ROLE)[keyof typeof AI_MESSAGE_ROLE];

/**
 * Only these roles may open the personal workspace.
 * Temporarily switched off for everyone, admins included. To turn it back on, restore
 * [Role.SUPER_ADMIN, Role.ADMIN] here and in the frontend AI_PERSONAL_ROLES.
 */
export const PERSONAL_WORKSPACE_ROLES: string[] = [];

/**
 * Gemini models tried in order (Google retires models often, and a model can be overloaded).
 * GEMINI_MODEL, when set, is tried first.
 */
export const DEFAULT_AI_MODELS = [
  "gemini-3.1-flash-lite", // measured fastest (about 3s per turn); handles tool calls fine
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.8-flash",
];

/** Stop starting new model round-trips after this long, so one question can't run for minutes. */
export const AI_TOTAL_BUDGET_MS = 80_000;

/** Max model round-trips (tool loops) for one user message. */
export const MAX_TOOL_ITERATIONS = 6;
/** How many earlier text messages of the conversation are sent back to the model. */
export const MAX_HISTORY_MESSAGES = 20;
/** Max characters of one tool result handed to the model. */
export const MAX_TOOL_RESULT_CHARS = 12000;
/** Max records a single list tool returns. */
export const MAX_TOOL_RECORDS = 20;
export const AI_MAX_OUTPUT_TOKENS = 4096;

/** Per-user request limit for POST /ai/chat (best effort, per server instance). */
export const AI_RATE_LIMIT_MAX = 20;
export const AI_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
