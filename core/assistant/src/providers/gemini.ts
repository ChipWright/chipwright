// Native Google Gemini provider (generateContent). Gemini uses `contents` with user/model
// roles and typed `parts`, a `systemInstruction`, and `tools.functionDeclarations`. It has
// no tool-call ids and correlates a function result to its call by name, which is why tool
// messages carry the tool name. Consecutive same-role turns are merged, as with Anthropic.

import type { LlmConfig } from "../config.js";
import type { Completion, CompletionRequest, LlmProvider, Message, ToolCall } from "../types.js";
import { isRecord, postJson, ProviderError } from "./shared.js";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

type Part = Record<string, unknown>;
interface Content {
  role: "user" | "model";
  parts: Part[];
}

function partsFor(message: Message): Content {
  if (message.role === "tool") {
    return {
      role: "user",
      parts: [{ functionResponse: { name: message.name ?? "", response: { result: message.content } } }],
    };
  }
  if (message.role === "assistant") {
    const parts: Part[] = [];
    if (message.content.length > 0) {
      parts.push({ text: message.content });
    }
    for (const call of message.toolCalls ?? []) {
      parts.push({ functionCall: { name: call.name, args: call.arguments } });
    }
    return { role: "model", parts };
  }
  return { role: "user", parts: [{ text: message.content }] };
}

function toContents(messages: Message[]): Content[] {
  const out: Content[] = [];
  for (const message of messages) {
    const content = partsFor(message);
    const last = out[out.length - 1];
    if (last !== undefined && last.role === content.role) {
      last.parts.push(...content.parts);
    } else {
      out.push(content);
    }
  }
  return out;
}

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  private readonly baseUrl: string;

  constructor(private readonly config: LlmConfig) {
    this.baseUrl = (config.baseUrl ?? BASE_URL).replace(/\/$/, "");
  }

  async complete(request: CompletionRequest): Promise<Completion> {
    const body: Record<string, unknown> = {
      contents: toContents(request.messages),
      systemInstruction: { parts: [{ text: request.system }] },
      generationConfig: {
        maxOutputTokens: request.maxTokens,
        ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      },
    };
    if (request.tools.length > 0) {
      body["tools"] = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    const url = `${this.baseUrl}/models/${encodeURIComponent(request.model)}:generateContent`;
    const data = await postJson(url, { "x-goog-api-key": this.config.apiKey }, body);
    if (!isRecord(data) || !Array.isArray(data["candidates"]) || !isRecord(data["candidates"][0])) {
      throw new ProviderError("malformed response: no candidates");
    }
    const candidate = data["candidates"][0];
    const content = isRecord(candidate["content"]) ? candidate["content"] : {};
    const parts = Array.isArray(content["parts"]) ? content["parts"] : [];

    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const part of parts) {
      if (!isRecord(part)) {
        continue;
      }
      if (typeof part["text"] === "string") {
        text += part["text"];
      } else if (isRecord(part["functionCall"]) && typeof part["functionCall"]["name"] === "string") {
        const fc = part["functionCall"];
        const name = fc["name"] as string;
        toolCalls.push({
          id: `${name}-${toolCalls.length}`,
          name,
          arguments: isRecord(fc["args"]) ? fc["args"] : {},
        });
      }
    }
    return { text, toolCalls, stop: toolCalls.length > 0 ? "tool_use" : "end" };
  }
}
