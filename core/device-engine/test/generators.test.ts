import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "../src/compile.js";
import { parseManifest } from "../src/parse.js";

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

function generate() {
  const { ir } = parseManifest(MANIFEST);
  assert.ok(ir);
  return compile(ir);
}

test("firmware generator emits a header with prototypes and an enum", () => {
  const files = generate();
  const header = files.find((f) => f.path === "firmware/smart_thermostat_interface.h");
  assert.ok(header);
  assert.match(header.contents, /#ifndef OPENHOME_SMART_THERMOSTAT_INTERFACE_H/);
  assert.match(header.contents, /oh_temperature_sensor_read\(float \*out_value\);/);
  assert.match(header.contents, /#define OH_TEMPERATURE_SENSOR_MIN \(-20\)/);
  assert.match(header.contents, /OH_HVAC_MODE_HEATING,/);
  assert.match(header.contents, /oh_hvac_set_mode\(oh_hvac_mode_t mode\);/);
});

test("documentation generator emits a capability table", () => {
  const files = generate();
  const doc = files.find((f) => f.path === "docs/smart_thermostat.md");
  assert.ok(doc);
  assert.match(doc.contents, /# smart_thermostat/);
  assert.match(doc.contents, /\| `temperature_sensor` \| sensor \| celsius \| -20 to 50 \|/);
  assert.match(doc.contents, /\| `hvac` \| actuator \| - \| heating, cooling, off \|/);
});

test("generated artifacts contain no emoji", () => {
  const files = generate();
  const emoji = /\p{Extended_Pictographic}/u;
  for (const file of files) {
    assert.equal(emoji.test(file.contents), false, `emoji found in ${file.path}`);
  }
});
