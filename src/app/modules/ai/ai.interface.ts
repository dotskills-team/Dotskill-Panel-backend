import { Types } from "mongoose";
import { AiMessageRole, AiWorkspace } from "./ai.constant";

export interface IAiConversation {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  workspace: AiWorkspace;
  title: string;

  isDeleted?: boolean;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAiMessage {
  _id?: Types.ObjectId;
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: AiMessageRole;
  content: string;

  isDeleted?: boolean;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;

  createdAt?: Date;
  updatedAt?: Date;
}

/** One tool call made while answering a message. */
export interface IAiExecutionLog {
  _id?: Types.ObjectId;
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  workspace: AiWorkspace;
  toolName: string;
  input: Record<string, unknown>;
  success: boolean;
  error?: string;
  durationMs: number;

  isDeleted?: boolean;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAiChatPayload {
  message: string;
  workspace: AiWorkspace;
  conversationId?: string;
}

export interface IAiChatResult {
  conversationId: string;
  workspace: AiWorkspace;
  reply: string;
  toolsUsed: string[];
}
