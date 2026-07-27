import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runAgent } from "../src/agent.js";
import { firmwareTools, type FirmwareToolContext } from "../src/firmware.js";
import { MockProvider } from "../src/providers/mock.js";
import type { Completion } from "../src/types.js";
import type { BspFile } from "../src/bsp-compile.js";

const SDK = resolve(fileURLToPath(new URL("../../../sdk/firmware", import.meta.url)));

const MANIFEST = `
device:
  name: smart_thermostat
  category: thermostat
capabilities:
  temperature_sensor:
    type: sensor
    unit: celsius
    range: { min: -20, max: 50 }
  hvac:
    type: actuator
    modes: [heating, cooling, off]
connectivity:
  protocols: [matter]
`;

function toolUse(name: string, args: Record<string, unknown>): Completion {
  return { text: "", toolCalls: [{ id: `${name}-1`, name, arguments: args }], stop: "tool_use" };
}
function final(text: string): Completion {
  return { text, toolCalls: [], stop: "end" };
}

// Firmware that implements every generated prototype by delegating to the HAL, matching the
// interface for this device (cw_temperature_sensor_read, cw_hvac_set_mode / cw_hvac_mode_t).
const GOOD_FILES: BspFile[] = [
  {
    path: "smart_thermostat.c",
    content:
      '#include "chipwright/hal.h"\n#include "chipwright/sdk.h"\n#include "smart_thermostat_interface.h"\n' +
      "cw_status_t cw_temperature_sensor_read(float *out_value) {\n  return cw_hal_read_sensor(\"temperature_sensor\", out_value);\n}\n" +
      "cw_status_t cw_hvac_set_mode(cw_hvac_mode_t mode) {\n  return cw_hal_set_actuator_mode(\"hvac\", (int)mode);\n}\n",
  },
];

// Firmware whose actuator signature does not match the generated interface (wrong enum type),
// so it cannot compile against this device.
const BROKEN_FILES: BspFile[] = [
  {
    path: "smart_thermostat.c",
    content:
      '#include "smart_thermostat_interface.h"\ncw_status_t cw_hvac_set_mode(int mode) {\n  return no_such_function(mode);\n}\n',
  },
];

async function run(scripted: Completion[]) {
  const context: FirmwareToolContext = { proposals: [], sdkFirmwareDir: SDK, manifestYaml: MANIFEST };
  const provider = new MockProvider(scripted);
  const result = await runAgent({
    provider,
    tools: firmwareTools(),
    context,
    messages: [{ role: "user", content: "implement the thermostat firmware" }],
    model: "mock-model",
  });
  return { provider, result };
}

test("read_device_interface returns the prototypes generated from the manifest", async () => {
  const context: FirmwareToolContext = { proposals: [], sdkFirmwareDir: SDK, manifestYaml: MANIFEST };
  const tool = firmwareTools().find((t) => t.schema.name === "read_device_interface");
  assert.ok(tool);
  const output = await tool.handler({}, context);
  assert.match(output, /cw_temperature_sensor_read\(float \*out_value\)/);
  assert.match(output, /cw_hvac_set_mode\(cw_hvac_mode_t mode\)/);
});

test("the loop reads the interface then proposes firmware that compiles", async () => {
  const { result, provider } = await run([
    toolUse("read_device_interface", {}),
    toolUse("propose_firmware", { summary: "implements the capability prototypes", files: GOOD_FILES }),
    final("Drafted the thermostat firmware."),
  ]);
  assert.equal(result.answer, "Drafted the thermostat firmware.");
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0]?.files.length, 1);
  assert.ok(provider.requests[0]?.tools.some((t) => t.name === "propose_firmware"));
});

test("firmware that does not compile is rejected and never surfaces", async () => {
  const { result } = await run([
    toolUse("propose_firmware", { summary: "broken", files: BROKEN_FILES }),
    toolUse("propose_firmware", { summary: "fixed", files: GOOD_FILES }),
    final("Fixed and proposed."),
  ]);
  assert.equal(result.answer, "Fixed and proposed.");
  assert.equal(result.proposals.length, 1, "only the compiling firmware is recorded");
  assert.equal(result.proposals[0]?.summary, "fixed");
});

test("compile_firmware surfaces compiler errors for the model to fix", async () => {
  const { result } = await run([
    toolUse("compile_firmware", { files: BROKEN_FILES }),
    final("It does not compile yet."),
  ]);
  assert.equal(result.answer, "It does not compile yet.");
  assert.equal(result.proposals.length, 0);
});
