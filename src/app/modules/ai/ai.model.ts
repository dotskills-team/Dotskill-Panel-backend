import { model, Schema } from "mongoose";
import { AI_MESSAGE_ROLE, AI_WORKSPACE } from "./ai.constant";
import { IAiConversation, IAiExecutionLog, IAiMessage } from "./ai.interface";

const softDeleteFields = {
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
};

const aiConversationSchema = new Schema<IAiConversation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    workspace: {
      type: String,
      enum: Object.values(AI_WORKSPACE),
      required: true,
    },
    title: { type: String, trim: true, default: "New chat" },
    ...softDeleteFields,
  },
  { timestamps: true, versionKey: false },
);
aiConversationSchema.index({ userId: 1, isDeleted: 1, updatedAt: -1 });

const aiMessageSchema = new Schema<IAiMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "AiConversation",
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: Object.values(AI_MESSAGE_ROLE), required: true },
    content: { type: String, required: true },
    ...softDeleteFields,
  },
  { timestamps: true, versionKey: false },
);
aiMessageSchema.index({ conversationId: 1, isDeleted: 1, createdAt: 1 });

const aiExecutionLogSchema = new Schema<IAiExecutionLog>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "AiConversation",
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    workspace: { type: String, enum: Object.values(AI_WORKSPACE), required: true },
    toolName: { type: String, required: true, index: true },
    input: { type: Schema.Types.Mixed, default: {} },
    success: { type: Boolean, required: true },
    error: { type: String },
    durationMs: { type: Number, required: true },
    ...softDeleteFields,
  },
  { timestamps: true, versionKey: false },
);

export const AiConversation = model<IAiConversation>("AiConversation", aiConversationSchema);
export const AiMessage = model<IAiMessage>("AiMessage", aiMessageSchema);
export const AiExecutionLog = model<IAiExecutionLog>("AiExecutionLog", aiExecutionLogSchema);
