// Native Anthropic Messages API provider. Anthropic uses a system field, content blocks,
// and `input_schema` on tools; tool results go back as a user turn of `tool_result`
// blocks. Consecutive same-role turns are merged because the Messages API expects roles to
// alternate, which matters when the model calls several tools in one turn.

import type { LlmConfig } from "../config.js";
import type { Completion, CompletionRequest, LlmProvider, Message, ToolCall } from "../types.js";
import { isRecord, postJson, ProviderError } from "./shared.js";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const API_VERSION = "2023-06-01";

type Block = Record<string, unknown>;
interface AnthropicMessage {
  role: "user" | "assistant";
  content: Block[];
}

function blocksFor(message: Message): { role: "user" | "assistant"; content: Block[] } {
  if (message.role === "tool") {
    return {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: message.toolCallId ?? "", content: message.content }],
    };
  }
  if (message.role === "assistant") {
    const content: Block[] = [];
    if (message.content.length > 0) {
      content.push({ type: "text", text: message.content });
    }
    for (const call of message.toolCalls ?? []) {
      content.push({ type: "tool_use", id: call.id, name: call.name, input: call.arguments });
    }
    return { role: "assistant", content };
  }
  return { role: "user", content: [{ type: "text", text: message.content }] };
}

function toAnthropicMessages(messages: Message[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const message of messages) {
    const { role, content } = blocksFor(message);
    const last = out[out.length - 1];
    if (last !== undefined && last.role === role) {
      last.content.push(...content);
    } else {
      out.push({ role, content });
    }
  }
  return out;
}

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private readonly baseUrl: string;

  constructor(private readonly config: LlmConfig) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  async complete(request: CompletionRequest): Promise<Completion> {
    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: toAnthropicMessages(request.messages),
    };
    if (request.tools.length > 0) {
      body["tools"] = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }
    if (request.temperature !== undefined) {
      body["temperature"] = request.temperature;
    }

    const headers: Record<string, string> = {
      "x-api-key": this.config.apiKey,
      "anthropic-version": API_VERSION,
    };

    const data = await postJson(`${this.baseUrl}/v1/messages`, headers, body);
    if (!isRecord(data) || !Array.isArray(data["content"])) {
      throw new ProviderError("malformed response: no content");
    }

    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const block of data["content"]) {
      if (!isRecord(block)) {
        continue;
      }
      if (block["type"] === "text" && typeof block["text"] === "string") {
        text += block["text"];
      } else if (block["type"] === "tool_use" && typeof block["name"] === "string") {
        toolCalls.push({
          id: typeof block["id"] === "string" ? block["id"] : block["name"],
          name: block["name"],
          arguments: isRecord(block["input"]) ? block["input"] : {},
        });
      }
    }
    return { text, toolCalls, stop: data["stop_reason"] === "tool_use" ? "tool_use" : "end" };
  }
}
