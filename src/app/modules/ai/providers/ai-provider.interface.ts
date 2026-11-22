/**
 * Provider-neutral types for the AI assistant.
 * The service and the tools only know these types, so the LLM vendor can be swapped
 * by writing one new class that implements `AiProvider`.
 */

/** JSON-schema-like description of a tool's arguments (lowercase JSON schema types). */
export interface AiToolSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface AiToolDeclaration {
  name: string;
  description: string;
  parameters: AiToolSchema;
}

export interface AiToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AiToolResult {
  callId: string;
  name: string;
  content: string;
  isError: boolean;
}

export type AiChatTurn =
  | { role: "user"; text: string }
  /** `raw` is the provider's own copy of the turn; it is sent back unchanged on the next request. */
  | { role: "assistant"; text: string; toolCalls?: AiToolCall[]; raw?: unknown }
  | { role: "tool"; results: AiToolResult[] };

export type AiFinishReason = "stop" | "tool_calls" | "max_tokens" | "blocked" | "other";

export interface AiProviderResponse {
  text: string;
  toolCalls: AiToolCall[];
  finishReason: AiFinishReason;
  raw?: unknown;
}

export interface AiChatRequest {
  system: string;
  messages: AiChatTurn[];
  tools: AiToolDeclaration[];
}

export interface AiProvider {
  chat(request: AiChatRequest): Promise<AiProviderResponse>;
}

/** Thrown by providers so the service never needs to know a vendor's error classes. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    /** True when the vendor says we hit a rate limit / quota. */
    public readonly isRateLimit = false,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}
