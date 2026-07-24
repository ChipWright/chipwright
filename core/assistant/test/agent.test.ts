import assert from "node:assert/strict";
import { test } from "node:test";
import { runAgent } from "../src/agent.js";
import { defaultTools, type ToolContext } from "../src/tools.js";
import { MockProvider } from "../src/providers/mock.js";
import type { Completion } from "../src/types.js";
import { VALID_MANIFEST, INVALID_MANIFEST } from "./fixture.js";

function toolUse(name: string, args: Record<string, unknown>): Completion {
  return { text: "", toolCalls: [{ id: `${name}-1`, name, arguments: args }], stop: "tool_use" };
}
function final(text: string): Completion {
  return { text, toolCalls: [], stop: "end" };
}
function newContext(): ToolContext {
  return { proposals: [], readFile: () => Promise.resolve(VALID_MANIFEST) };
}

async function run(scripted: Completion[], maxSteps?: number) {
  const provider = new MockProvider(scripted);
  const context = newContext();
  const result = await runAgent({
    provider,
    tools: defaultTools(),
    context,
    messages: [{ role: "user", content: "help me" }],
    model: "mock-model",
    ...(maxSteps !== undefined ? { maxSteps } : {}),
  });
  return { provider, result };
}

test("a direct answer returns immediately", async () => {
  const { result } = await run([final("Here is what I found.")]);
  assert.equal(result.answer, "Here is what I found.");
  assert.equal(result.proposals.length, 0);
  assert.equal(result.steps, 1);
});

test("the loop runs tools then proposes a grounded device", async () => {
  const { result, provider } = await run([
    toolUse("validate_manifest", { yaml: VALID_MANIFEST }),
    toolUse("propose_device", { yaml: VALID_MANIFEST, summary: "add a thermostat" }),
    final("Proposed a thermostat."),
  ]);
  assert.equal(result.answer, "Proposed a thermostat.");
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0]?.deviceName, "smart_thermostat");
  assert.equal(result.steps, 3);
  // The tool schemas are advertised to the provider.
  assert.ok(provider.requests[0]?.tools.some((t) => t.name === "propose_device"));
});

test("an invalid proposal is rejected and never surfaces", async () => {
  const { result } = await run([
    toolUse("propose_device", { yaml: INVALID_MANIFEST, summary: "broken" }),
    toolUse("propose_device", { yaml: VALID_MANIFEST, summary: "fixed" }),
    final("Fixed and proposed."),
  ]);
  assert.equal(result.answer, "Fixed and proposed.");
  assert.equal(result.proposals.length, 1, "only the valid proposal is recorded");
  assert.equal(result.proposals[0]?.summary, "fixed");
});

test("the loop stops at the step cap instead of running forever", async () => {
  const { result } = await run(
    [
      toolUse("validate_manifest", { yaml: VALID_MANIFEST }),
      toolUse("validate_manifest", { yaml: VALID_MANIFEST }),
      toolUse("validate_manifest", { yaml: VALID_MANIFEST }),
    ],
    3,
  );
  assert.equal(result.steps, 3);
  assert.match(result.answer, /step limit/);
});
