import assert from "node:assert/strict";
import { test } from "node:test";
import { AnthropicProvider } from "../src/providers/anthropic.js";
import { GeminiProvider } from "../src/providers/gemini.js";
import { OpenAiCompatibleProvider } from "../src/providers/openai.js";
import type { CompletionRequest } from "../src/types.js";

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

// Replaces the global fetch with one that captures the outgoing request and returns canned
// data, so each adapter is tested for request shape and response parsing with no network.
async function withFetch<T>(data: unknown, run: (captured: Captured[]) => Promise<T>): Promise<T> {
  const captured: Captured[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
    captured.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
  }) as unknown as typeof fetch;
  try {
    return await run(captured);
  } finally {
    globalThis.fetch = original;
  }
}

const request: CompletionRequest = {
  system: "you are a test",
  messages: [
    { role: "user", content: "hi" },
    { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "validate_manifest", arguments: { yaml: "x" } }] },
    { role: "tool", content: "{\"valid\":true}", toolCallId: "c1", name: "validate_manifest" },
  ],
  tools: [{ name: "validate_manifest", description: "validate", parameters: { type: "object", properties: {} } }],
  model: "test-model",
  maxTokens: 512,
};

test("OpenAI-compatible: request shape and tool-call parsing", async () => {
  const data = {
    choices: [
      {
        message: {
          content: null,
          tool_calls: [{ id: "t1", type: "function", function: { name: "validate_manifest", arguments: "{\"yaml\":\"x\"}" } }],
        },
        finish_reason: "tool_calls",
      },
    ],
  };
  await withFetch(data, async (captured) => {
    const provider = new OpenAiCompatibleProvider({ provider: "openai-compatible", apiKey: "k", model: "m" });
    const completion = await provider.complete(request);
    const call = captured[0]!;
    assert.match(call.url, /\/chat\/completions$/);
    assert.equal(call.headers["authorization"], "Bearer k");
    assert.equal((call.body["messages"] as { role: string }[])[0]?.role, "system");
    assert.equal((call.body["tools"] as { type: string }[])[0]?.type, "function");
    assert.equal(completion.stop, "tool_use");
    assert.equal(completion.toolCalls[0]?.name, "validate_manifest");
    assert.deepEqual(completion.toolCalls[0]?.arguments, { yaml: "x" });
  });
});

test("Anthropic: request shape and tool_use parsing", async () => {
  const data = {
    content: [{ type: "tool_use", id: "u1", name: "validate_manifest", input: { yaml: "x" } }],
    stop_reason: "tool_use",
  };
  await withFetch(data, async (captured) => {
    const provider = new AnthropicProvider({ provider: "anthropic", apiKey: "sekret", model: "m" });
    const completion = await provider.complete(request);
    const call = captured[0]!;
    assert.match(call.url, /\/v1\/messages$/);
    assert.equal(call.headers["x-api-key"], "sekret");
    assert.equal(call.headers["anthropic-version"], "2023-06-01");
    assert.equal(call.body["system"], "you are a test");
    assert.ok((call.body["tools"] as { input_schema: unknown }[])[0]?.input_schema);
    assert.equal(completion.stop, "tool_use");
    assert.equal(completion.toolCalls[0]?.name, "validate_manifest");
  });
});

test("Gemini: request shape and functionCall parsing", async () => {
  const data = {
    candidates: [{ content: { parts: [{ functionCall: { name: "validate_manifest", args: { yaml: "x" } } }] } }],
  };
  await withFetch(data, async (captured) => {
    const provider = new GeminiProvider({ provider: "gemini", apiKey: "gk", model: "gemini-x" });
    const completion = await provider.complete(request);
    const call = captured[0]!;
    assert.match(call.url, /models\/test-model:generateContent$/);
    assert.equal(call.headers["x-goog-api-key"], "gk");
    assert.ok((call.body["systemInstruction"] as { parts: unknown[] }).parts.length > 0);
    assert.ok((call.body["tools"] as { functionDeclarations: unknown[] }[])[0]?.functionDeclarations);
    assert.equal(completion.stop, "tool_use");
    assert.equal(completion.toolCalls[0]?.name, "validate_manifest");
  });
});

test("a text-only response parses as a final answer", async () => {
  await withFetch({ content: [{ type: "text", text: "all good" }], stop_reason: "end_turn" }, async () => {
    const provider = new AnthropicProvider({ provider: "anthropic", apiKey: "k", model: "m" });
    const completion = await provider.complete(request);
    assert.equal(completion.stop, "end");
    assert.equal(completion.text, "all good");
    assert.equal(completion.toolCalls.length, 0);
  });
});
