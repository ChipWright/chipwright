// Configuration for which model to talk to. The assistant is bring-your-own-key: the
// developer supplies the provider, their API key, and a model. The OpenAI-compatible
// provider additionally takes a base URL, which is what lets one adapter reach OpenAI,
// OpenRouter, Groq, DeepSeek, Mistral, and local servers (Ollama, LM Studio) alike.

export type ProviderName = "anthropic" | "gemini" | "openai-compatible";

export interface LlmConfig {
  provider: ProviderName;
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export class ConfigError extends Error {}

const PROVIDERS: readonly ProviderName[] = ["anthropic", "gemini", "openai-compatible"];

// Sensible current defaults, all overridable. These are starting points, not a fixed
// policy: any model the chosen endpoint serves can be named instead.
const DEFAULT_MODELS: Record<ProviderName, string> = {
  anthropic: "claude-sonnet-5",
  gemini: "gemini-2.5-flash",
  "openai-compatible": "gpt-4o",
};

// The default model for a provider, used when none is configured. Shared by the CLI's
// environment loader and any other surface (such as the IDE) that builds a config.
export function defaultModel(provider: ProviderName): string {
  return DEFAULT_MODELS[provider];
}

// Reads configuration from the environment. `openai` is accepted as an alias for
// `openai-compatible`. A missing key is allowed only for a local base URL, since local
// servers such as Ollama do not require one.
export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const raw = (env["CHIPWRIGHT_LLM_PROVIDER"] ?? "anthropic").toLowerCase();
  const provider: ProviderName = raw === "openai" ? "openai-compatible" : (raw as ProviderName);
  if (!PROVIDERS.includes(provider)) {
    throw new ConfigError(
      `unknown CHIPWRIGHT_LLM_PROVIDER "${raw}" (expected anthropic, gemini, or openai-compatible)`,
    );
  }

  const apiKey = env["CHIPWRIGHT_LLM_API_KEY"] ?? "";
  const baseUrl = env["CHIPWRIGHT_LLM_BASE_URL"];
  const isLocal = baseUrl !== undefined && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(baseUrl);
  if (apiKey.length === 0 && !isLocal) {
    throw new ConfigError("CHIPWRIGHT_LLM_API_KEY is required (set CHIPWRIGHT_LLM_BASE_URL to a local server to run keyless)");
  }

  const config: LlmConfig = {
    provider,
    apiKey,
    model: env["CHIPWRIGHT_LLM_MODEL"] ?? defaultModel(provider),
  };
  if (baseUrl !== undefined) {
    config.baseUrl = baseUrl;
  }
  const maxTokens = env["CHIPWRIGHT_LLM_MAX_TOKENS"];
  if (maxTokens !== undefined && Number.isFinite(Number(maxTokens))) {
    config.maxTokens = Number(maxTokens);
  }
  return config;
}
