import { StatusCodes } from "http-status-codes";
import { JwtPayload } from "jsonwebtoken";
import { Types } from "mongoose";
import AppError from "../../errorHelpers/appError";
import {
  AI_MESSAGE_ROLE,
  AI_TOTAL_BUDGET_MS,
  AI_WORKSPACE,
  MAX_HISTORY_MESSAGES,
  MAX_TOOL_ITERATIONS,
  PERSONAL_WORKSPACE_ROLES,
} from "./ai.constant";
import { IAiChatPayload, IAiChatResult } from "./ai.interface";
import { AiConversation, AiExecutionLog, AiMessage } from "./ai.model";
import { buildSystemPrompt } from "./ai.prompt";
import { AiTool, executeTool, getToolsForRole, toToolDeclarations } from "./ai.tools";
import { AiChatTurn, AiProviderError, AiToolResult } from "./providers/ai-provider.interface";
import { getAiProvider } from "./providers";

const FALLBACK_REPLY =
  "Sorry, I couldn't put together an answer. Please try rephrasing your question.";

const chat = async (actor: JwtPayload, payload: IAiChatPayload): Promise<IAiChatResult> => {
  const { workspace, message } = payload;
  const role = String(actor.role);
  const userId = new Types.ObjectId(String(actor.userId));

  // Personal workspace is admin-only. Enforced here, the UI hiding it is only cosmetic.
  if (workspace === AI_WORKSPACE.PERSONAL && !PERSONAL_WORKSPACE_ROLES.includes(role)) {
    throw new AppError(StatusCodes.FORBIDDEN, "Personal workspace is available to admins only");
  }

  // Load or create the conversation (always scoped to the logged-in user)
  let conversation;
  if (payload.conversationId) {
    conversation = await AiConversation.findOne({
      _id: payload.conversationId,
      userId,
      isDeleted: false,
    });
    if (!conversation) throw new AppError(StatusCodes.NOT_FOUND, "Conversation not found");
    if (conversation.workspace !== workspace) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "This conversation belongs to a different workspace",
      );
    }
  } else {
    conversation = await AiConversation.create({
      userId,
      workspace,
      title: message.slice(0, 60),
    });
  }

  const historyDocs = await AiMessage.find({
    conversationId: conversation._id,
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .limit(MAX_HISTORY_MESSAGES)
    .lean();

  const messages: AiChatTurn[] = historyDocs
    .reverse()
    .map((m): AiChatTurn =>
      m.role === AI_MESSAGE_ROLE.USER
        ? { role: "user", text: m.content }
        : { role: "assistant", text: m.content },
    );
  messages.push({ role: "user", text: message });

  await AiMessage.create({
    conversationId: conversation._id,
    userId,
    role: AI_MESSAGE_ROLE.USER,
    content: message,
  });

  // Business gets role-filtered read-only tools; personal gets none.
  const tools: AiTool[] = workspace === AI_WORKSPACE.BUSINESS ? getToolsForRole(role) : [];
  const system = buildSystemPrompt({ workspace, role, toolNames: tools.map((t) => t.name) });

  const toolsUsed: string[] = [];
  let reply = "";

  try {
    const provider = getAiProvider();
    const declarations = toToolDeclarations(tools);

    const startedAt = Date.now();

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      if (Date.now() - startedAt > AI_TOTAL_BUDGET_MS) {
        reply = "Sorry, that took too long to work out. Please try a more specific question.";
        break;
      }

      const response = await provider.chat({ system, messages, tools: declarations });

      if (response.finishReason === "blocked") {
        reply = "Sorry, I can't help with that request.";
        break;
      }

      if (response.finishReason !== "tool_calls") {
        reply = response.text;
        if (response.finishReason === "max_tokens") reply += "\n\n...(the answer was cut off because it was too long)";
        break;
      }

      // Keep the model's turn, then answer ALL of its tool calls together in one turn.
      messages.push({
        role: "assistant",
        text: response.text,
        toolCalls: response.toolCalls,
        raw: response.raw,
      });

      const results: AiToolResult[] = await Promise.all(
        response.toolCalls.map(async (call) => {
          const run = await executeTool(call.name, call.args, actor, tools);
          toolsUsed.push(call.name);
          await AiExecutionLog.create({
            conversationId: conversation._id,
            userId,
            workspace,
            toolName: call.name,
            input: call.args,
            success: !run.isError,
            error: run.errorMessage,
            durationMs: run.durationMs,
          });
          return { callId: call.id, name: call.name, content: run.content, isError: run.isError };
        }),
      );
      messages.push({ role: "tool", results });
    }
  } catch (err) {
    if (err instanceof AiProviderError) {
      console.error("[ai] provider error", err.status, err.message);
      if (err.isRateLimit) {
        throw new AppError(
          StatusCodes.TOO_MANY_REQUESTS,
          "The AI service is busy right now. Please try again in a minute.",
        );
      }
      throw new AppError(
        StatusCodes.BAD_GATEWAY,
        "The AI service is temporarily unavailable. Please try again.",
      );
    }
    throw err;
  }

  if (!reply) reply = FALLBACK_REPLY;

  await AiMessage.create({
    conversationId: conversation._id,
    userId,
    role: AI_MESSAGE_ROLE.ASSISTANT,
    content: reply,
  });
  await AiConversation.updateOne({ _id: conversation._id }, { $set: { updatedAt: new Date() } });

  return {
    conversationId: String(conversation._id),
    workspace,
    reply,
    toolsUsed: [...new Set(toolsUsed)],
  };
};

export const AiService = { chat };
