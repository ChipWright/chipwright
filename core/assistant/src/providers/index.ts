// Selects a provider adapter from configuration. This is the only place that knows the set
// of providers, so the agent and CLI stay provider-agnostic.

import type { LlmConfig } from "../config.js";
import type { LlmProvider } from "../types.js";
import { AnthropicProvider } from "./anthropic.js";
import { GeminiProvider } from "./gemini.js";
import { OpenAiCompatibleProvider } from "./openai.js";

export function providerFromConfig(config: LlmConfig): LlmProvider {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "gemini":
      return new GeminiProvider(config);
    case "openai-compatible":
      return new OpenAiCompatibleProvider(config);
  }
}

export { AnthropicProvider } from "./anthropic.js";
export { GeminiProvider } from "./gemini.js";
export { OpenAiCompatibleProvider } from "./openai.js";
export { MockProvider } from "./mock.js";
export { ProviderError } from "./shared.js";
