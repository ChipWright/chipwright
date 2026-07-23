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

test("cloud-api generator emits an OpenAPI spec bound to the manifest", () => {
  const files = generate();
  const api = files.find((f) => f.path === "cloud/smart_thermostat.openapi.json");
  assert.ok(api);
  const spec = JSON.parse(api.contents);
  assert.equal(spec.openapi, "3.1.0");
  assert.ok(spec.paths["/devices/{deviceId}/telemetry"]);
  assert.ok(spec.paths["/devices/{deviceId}/shadow"]);
  assert.deepEqual(spec.components.schemas.TelemetrySample.properties.metric.enum, [
    "temperature_sensor",
  ]);
  assert.ok(spec.components.schemas.DeviceShadow.properties.temperature_sensor);
  assert.equal(spec.components.schemas.DeviceShadow.properties.temperature_sensor.properties.unit.const, "celsius");
  assert.deepEqual(spec.components.schemas.Command.properties.name.enum, ["set_hvac_mode"]);
  assert.deepEqual(spec.components.schemas.Command.properties.args.properties.mode.enum, [
    "heating",
    "cooling",
    "off",
  ]);
});

test("test-stub generator emits a suite with per-capability assertions", () => {
  const files = generate();
  const suite = files.find((f) => f.path === "tests/smart_thermostat_generated.c");
  assert.ok(suite);
  assert.match(suite.contents, /void oh_generated_suite\(oh_test_run_t \*run, oh_test_target_t \*target\)/);
  assert.match(suite.contents, /target->connect\(target->ctx\) == OH_OK/);
  assert.match(suite.contents, /read_sensor\(target->ctx, "temperature_sensor", &temperature_sensor\)/);
  assert.match(suite.contents, /temperature_sensor >= -20\.0f && temperature_sensor <= 50\.0f/);
  assert.match(suite.contents, /set_mode\(target->ctx, "hvac", 0\) == OH_OK\);  \/\/ heating/);
  assert.match(suite.contents, /set_mode\(target->ctx, "hvac", 2\) == OH_OK\);  \/\/ off/);
});

test("generated artifacts contain no emoji", () => {
  const files = generate();
  const emoji = /\p{Extended_Pictographic}/u;
  for (const file of files) {
    assert.equal(emoji.test(file.contents), false, `emoji found in ${file.path}`);
  }
});
