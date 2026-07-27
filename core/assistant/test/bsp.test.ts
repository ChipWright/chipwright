import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runAgent } from "../src/agent.js";
import { bspTools, type BspToolContext } from "../src/bsp.js";
import { MockProvider } from "../src/providers/mock.js";
import type { Completion } from "../src/types.js";
import type { BspFile } from "../src/bsp-compile.js";

const SDK = resolve(fileURLToPath(new URL("../../../sdk/firmware", import.meta.url)));

function toolUse(name: string, args: Record<string, unknown>): Completion {
  return { text: "", toolCalls: [{ id: `${name}-1`, name, arguments: args }], stop: "tool_use" };
}
function final(text: string): Completion {
  return { text, toolCalls: [], stop: "end" };
}

const GOOD_FILES: BspFile[] = [
  {
    path: "widget_bsp.h",
    content:
      '#ifndef WIDGET_BSP_H\n#define WIDGET_BSP_H\n#include "openhome/sdk.h"\noh_status_t oh_widget_bsp_register(void);\n#endif\n',
  },
  {
    path: "widget_bsp.c",
    content:
      '#include "widget_bsp.h"\n#include "openhome/hal.h"\n' +
      "static oh_status_t widget_read(void *ctx, float *out) {\n  (void)ctx;\n  *out = 42.0f;\n  return OH_OK;\n}\n" +
      "oh_status_t oh_widget_bsp_register(void) {\n" +
      "  const oh_sensor_driver_t s = {.read = widget_read, .ctx = NULL};\n" +
      '  return oh_hal_register_sensor("temperature_sensor", "celsius", s);\n}\n',
  },
];

const BROKEN_FILES: BspFile[] = [
  {
    path: "widget_bsp.c",
    content:
      '#include "openhome/hal.h"\noh_status_t oh_widget_bsp_register(void) {\n  return no_such_function();\n}\n',
  },
];

async function run(scripted: Completion[]) {
  const context: BspToolContext = { proposals: [], sdkFirmwareDir: SDK };
  const provider = new MockProvider(scripted);
  const result = await runAgent({
    provider,
    tools: bspTools(),
    context,
    messages: [{ role: "user", content: "draft a BSP for the widget board" }],
    model: "mock-model",
  });
  return { provider, result };
}

test("the loop reads the HAL then proposes a BSP that compiles", async () => {
  const { result, provider } = await run([
    toolUse("read_hal_interface", {}),
    toolUse("propose_bsp", { board: "widget", summary: "widget temperature BSP", files: GOOD_FILES }),
    final("Drafted the widget BSP."),
  ]);
  assert.equal(result.answer, "Drafted the widget BSP.");
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0]?.board, "widget");
  assert.equal(result.proposals[0]?.files.length, 2);
  assert.ok(provider.requests[0]?.tools.some((t) => t.name === "propose_bsp"));
});

test("a BSP that does not compile is rejected and never surfaces", async () => {
  const { result } = await run([
    toolUse("propose_bsp", { board: "widget", summary: "broken", files: BROKEN_FILES }),
    toolUse("propose_bsp", { board: "widget", summary: "fixed", files: GOOD_FILES }),
    final("Fixed and proposed."),
  ]);
  assert.equal(result.answer, "Fixed and proposed.");
  assert.equal(result.proposals.length, 1, "only the compiling BSP is recorded");
  assert.equal(result.proposals[0]?.summary, "fixed");
});

test("compile_bsp surfaces compiler errors for the model to fix", async () => {
  const { result } = await run([toolUse("compile_bsp", { files: BROKEN_FILES }), final("It does not compile yet.")]);
  // The tool result is fed back into the loop; the run completes with the model's summary.
  assert.equal(result.answer, "It does not compile yet.");
  assert.equal(result.proposals.length, 0);
});
