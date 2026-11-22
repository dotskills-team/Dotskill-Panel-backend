import { envVars } from "../../../config/env";
import { DEFAULT_AI_MODELS } from "../ai.constant";
import { AiProvider } from "./ai-provider.interface";
import { GeminiProvider } from "./gemini.provider";

let provider: AiProvider | null = null;

/** The one place that decides which LLM vendor the assistant uses. */
export const getAiProvider = (): AiProvider => {
  if (!provider) {
    const models = [envVars.GEMINI_MODEL, ...DEFAULT_AI_MODELS].filter(
      (m, i, all): m is string => !!m && all.indexOf(m) === i,
    );
    provider = new GeminiProvider(envVars.GEMINI_API_KEY, models);
  }
  return provider;
};
