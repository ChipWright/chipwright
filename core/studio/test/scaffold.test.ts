import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { generate } from "../src/manifest.js";
import { scaffold } from "../src/scaffold.js";

const THERMOSTAT = `
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

const SDK_INCLUDE = resolve(fileURLToPath(new URL("../../../sdk/firmware/include", import.meta.url)));

test("scaffolds an editable firmware module and README for a valid device", () => {
  const result = scaffold(THERMOSTAT);
  assert.equal(result.valid, true);
  const paths = result.files.map((f) => f.path).sort();
  assert.deepEqual(paths, ["firmware/README.md", "firmware/smart_thermostat.c"]);
});

test("the module implements the generated prototypes and registers each capability", () => {
  const module = scaffold(THERMOSTAT).files.find((f) => f.path.endsWith(".c"));
  assert.ok(module);
  const src = module.contents;
  assert.match(src, /#include "smart_thermostat_interface\.h"/);
  assert.match(src, /oh_status_t oh_temperature_sensor_read\(float \*out_value\)/);
  assert.match(src, /oh_status_t oh_hvac_set_mode\(oh_hvac_mode_t mode\)/);
  assert.match(src, /oh_hal_register_sensor\("temperature_sensor", "celsius", temperature_sensor_driver\)/);
  assert.match(src, /oh_hal_register_actuator\("hvac", hvac_driver\)/);
});

test("does not scaffold from a manifest that does not compile", () => {
  const result = scaffold("device: {}\n");
  assert.equal(result.valid, false);
  assert.equal(result.files.length, 0);
});

// The scaffold is only useful if it actually fits the generated interface and the SDK. Compile
// it to an object against the real interface header and SDK headers, so a drift in prototype
// naming or the HAL surface fails the test rather than reaching a developer.
test("the scaffolded module compiles against the generated interface and the SDK", () => {
  let cc: string;
  try {
    cc = process.env["CC"] ?? "cc";
    execFileSync(cc, ["--version"], { stdio: "ignore" });
  } catch {
    return; // No C compiler available (skip in that environment).
  }
  const iface = generate(THERMOSTAT).files.find((f) => f.path.endsWith("_interface.h"));
  const module = scaffold(THERMOSTAT).files.find((f) => f.path.endsWith(".c"));
  assert.ok(iface && module);

  const dir = mkdtempSync(join(tmpdir(), "openhome-scaffold-"));
  try {
    writeFileSync(join(dir, "smart_thermostat_interface.h"), iface.contents, "utf8");
    writeFileSync(join(dir, "smart_thermostat.c"), module.contents, "utf8");
    execFileSync(
      cc,
      ["-std=c11", "-Wall", "-Wextra", "-I", SDK_INCLUDE, "-I", dir, "-c", join(dir, "smart_thermostat.c"), "-o", join(dir, "out.o")],
      { stdio: "pipe" },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
