// OpenAI-compatible provider. This is the universal adapter: it speaks the Chat Completions
// format, which OpenAI, OpenRouter, Groq, DeepSeek, Mistral, Azure OpenAI, and local
// servers (Ollama, LM Studio, vLLM) all expose. Point `baseUrl` at any such endpoint.

import type { LlmConfig } from "../config.js";
import type { Completion, CompletionRequest, LlmProvider, Message, ToolCall } from "../types.js";
import { isRecord, postJson, ProviderError } from "./shared.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

function toOpenAiMessages(system: string, messages: Message[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: "system", content: system }];
  for (const message of messages) {
    if (message.role === "tool") {
      out.push({ role: "tool", content: message.content, tool_call_id: message.toolCallId ?? "" });
    } else if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
      out.push({
        role: "assistant",
        content: message.content.length > 0 ? message.content : null,
        tool_calls: message.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.arguments) },
        })),
      });
    } else {
      out.push({ role: message.role === "assistant" ? "assistant" : "user", content: message.content });
    }
  }
  return out;
}

function parseToolCalls(message: Record<string, unknown>): ToolCall[] {
  const raw = message["tool_calls"];
  if (!Array.isArray(raw)) {
    return [];
  }
  const calls: ToolCall[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || !isRecord(entry["function"])) {
      continue;
    }
    const fn = entry["function"];
    const name = typeof fn["name"] === "string" ? fn["name"] : "";
    const argText = typeof fn["arguments"] === "string" ? fn["arguments"] : "{}";
    let args: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(argText || "{}");
      if (isRecord(parsed)) {
        args = parsed;
      }
    } catch {
      // A model occasionally emits invalid JSON arguments; treat as empty rather than fail.
    }
    calls.push({ id: typeof entry["id"] === "string" ? entry["id"] : name, name, arguments: args });
  }
  return calls;
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = "openai-compatible";
  private readonly baseUrl: string;

  constructor(private readonly config: LlmConfig) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  async complete(request: CompletionRequest): Promise<Completion> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: toOpenAiMessages(request.system, request.messages),
      max_tokens: request.maxTokens,
    };
    if (request.tools.length > 0) {
      body["tools"] = request.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }
    if (request.temperature !== undefined) {
      body["temperature"] = request.temperature;
    }

    const headers: Record<string, string> = {};
    if (this.config.apiKey.length > 0) {
      headers["authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const data = await postJson(`${this.baseUrl}/chat/completions`, headers, body);
    if (!isRecord(data) || !Array.isArray(data["choices"]) || !isRecord(data["choices"][0])) {
      throw new ProviderError("malformed response: no choices");
    }
    const choice = data["choices"][0];
    const message = isRecord(choice["message"]) ? choice["message"] : {};
    const toolCalls = parseToolCalls(message);
    return {
      text: typeof message["content"] === "string" ? message["content"] : "",
      toolCalls,
      stop: toolCalls.length > 0 ? "tool_use" : "end",
    };
  }
}
