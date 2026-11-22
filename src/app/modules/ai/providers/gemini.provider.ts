import {
  Content,
  FinishReason,
  FunctionDeclaration,
  FunctionDeclarationSchema,
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
  Part,
} from "@google/generative-ai";
import { AI_MAX_OUTPUT_TOKENS } from "../ai.constant";
import {
  AiChatRequest,
  AiChatTurn,
  AiFinishReason,
  AiProvider,
  AiProviderError,
  AiProviderResponse,
  AiToolCall,
  AiToolDeclaration,
} from "./ai-provider.interface";

const toGeminiContents = (messages: AiChatTurn[]): Content[] =>
  messages.map((turn): Content => {
    if (turn.role === "user") return { role: "user", parts: [{ text: turn.text }] };

    if (turn.role === "assistant") {
      // Replay the model's own turn untouched when we have it (keeps any provider metadata).
      if (turn.raw) return turn.raw as Content;
      const parts: Part[] = [];
      if (turn.text) parts.push({ text: turn.text });
      for (const call of turn.toolCalls ?? []) {
        parts.push({ functionCall: { name: call.name, args: call.args } });
      }
      return { role: "model", parts: parts.length ? parts : [{ text: "" }] };
    }

    // All results of one model turn go back together in a single user turn.
    return {
      role: "user",
      parts: turn.results.map((r) => ({
        functionResponse: {
          name: r.name,
          response: r.isError ? { error: r.content } : { result: r.content },
        },
      })),
    };
  });

const toGeminiTools = (tools: AiToolDeclaration[]): FunctionDeclaration[] =>
  tools.map((t) => {
    const hasParams = Object.keys(t.parameters.properties).length > 0;
    return {
      name: t.name,
      description: t.description,
      // Gemini rejects an object schema with no properties, so no-arg tools omit it.
      ...(hasParams ? { parameters: t.parameters as unknown as FunctionDeclarationSchema } : {}),
    };
  });

const mapFinishReason = (reason: FinishReason | undefined, hasCalls: boolean): AiFinishReason => {
  if (hasCalls) return "tool_calls";
  switch (reason) {
    case undefined:
    case FinishReason.STOP:
      return "stop";
    case FinishReason.MAX_TOKENS:
      return "max_tokens";
    case FinishReason.SAFETY:
    case FinishReason.BLOCKLIST:
    case FinishReason.PROHIBITED_CONTENT:
    case FinishReason.SPII:
    case FinishReason.RECITATION:
      return "blocked";
    default:
      return "other";
  }
};

/** Per-request timeout so a stuck call fails instead of hanging the chat. */
const REQUEST_TIMEOUT_MS = 20_000;

/** Within one chat() call, stop trying further fallback models after this long. */
const FALLBACK_BUDGET_MS = 35_000;

/**
 * Statuses that mean "this model can't serve us right now, try the next one":
 * retired (404), timed out (408), per-model quota (429), overloaded (503).
 */
const isModelUnavailable = (status?: number) =>
  status === 404 || status === 408 || status === 429 || status === 503;

export class GeminiProvider implements AiProvider {
  private readonly genAI: GoogleGenerativeAI;

  /** `models` is tried in order; the first one that is available answers. */
  constructor(
    apiKey: string,
    private models: string[],
  ) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async chat(request: AiChatRequest): Promise<AiProviderResponse> {
    let lastError: AiProviderError | undefined;
    const startedAt = Date.now();

    for (const modelName of [...this.models]) {
      if (lastError && Date.now() - startedAt > FALLBACK_BUDGET_MS) break;
      try {
        const response = await this.chatWithModel(modelName, request);
        // Remember the model that worked so retired/overloaded ones aren't retried first every time.
        if (this.models[0] !== modelName) {
          this.models = [modelName, ...this.models.filter((m) => m !== modelName)];
        }
        return response;
      } catch (err) {
        if (err instanceof AiProviderError && isModelUnavailable(err.status)) {
          console.warn(`[ai] Gemini model ${modelName} unavailable (${err.status}), trying next`);
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    throw lastError ?? new AiProviderError("No Gemini model is configured");
  }

  private async chatWithModel(
    modelName: string,
    { system, messages, tools }: AiChatRequest,
  ): Promise<AiProviderResponse> {
    const model = this.genAI.getGenerativeModel(
      {
        model: modelName,
        systemInstruction: system,
        // Low temperature: this assistant reports business data, so it must not get "creative".
        generationConfig: { maxOutputTokens: AI_MAX_OUTPUT_TOKENS, temperature: 0.1 },
        ...(tools.length ? { tools: [{ functionDeclarations: toGeminiTools(tools) }] } : {}),
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );

    try {
      const { response } = await model.generateContent({ contents: toGeminiContents(messages) });

      if (response.promptFeedback?.blockReason) {
        return { text: "", toolCalls: [], finishReason: "blocked" };
      }

      const candidate = response.candidates?.[0];
      const calls = response.functionCalls() ?? [];
      const toolCalls: AiToolCall[] = calls.map((c, i) => ({
        id: `call-${i}`,
        name: c.name,
        args: (c.args ?? {}) as Record<string, unknown>,
      }));
      const text = (candidate?.content?.parts ?? [])
        .map((p) => ("text" in p && typeof p.text === "string" ? p.text : ""))
        .join("")
        .trim();

      return {
        text,
        toolCalls,
        finishReason: mapFinishReason(candidate?.finishReason, toolCalls.length > 0),
        raw: candidate?.content,
      };
    } catch (err) {
      if (err instanceof GoogleGenerativeAIFetchError) {
        throw new AiProviderError(err.message, err.status, err.status === 429);
      }
      const message = err instanceof Error ? err.message : "Gemini request failed";
      // The SDK reports a timeout as an abort without a status code
      throw new AiProviderError(message, /abort/i.test(message) ? 408 : undefined);
    }
  }
}
