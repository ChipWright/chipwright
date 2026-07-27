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
  assert.match(header.contents, /#ifndef CHIPWRIGHT_SMART_THERMOSTAT_INTERFACE_H/);
  assert.match(header.contents, /cw_temperature_sensor_read\(float \*out_value\);/);
  assert.match(header.contents, /#define CW_TEMPERATURE_SENSOR_MIN \(-20\)/);
  assert.match(header.contents, /CW_HVAC_MODE_HEATING,/);
  assert.match(header.contents, /cw_hvac_set_mode\(cw_hvac_mode_t mode\);/);
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
  assert.match(suite.contents, /void cw_generated_suite\(cw_test_run_t \*run, cw_test_target_t \*target\)/);
  assert.match(suite.contents, /target->connect\(target->ctx\) == CW_OK/);
  assert.match(suite.contents, /read_sensor\(target->ctx, "temperature_sensor", &temperature_sensor\)/);
  assert.match(suite.contents, /temperature_sensor >= -20\.0f && temperature_sensor <= 50\.0f/);
  assert.match(suite.contents, /set_mode\(target->ctx, "hvac", 0\) == CW_OK\);  \/\/ heating/);
  assert.match(suite.contents, /set_mode\(target->ctx, "hvac", 2\) == CW_OK\);  \/\/ off/);
});

test("docs-site generator emits a browsable static site", () => {
  const files = generate();
  const base = "docs/site/smart_thermostat";

  const index = files.find((f) => f.path === `${base}/index.html`);
  assert.ok(index);
  assert.match(index.contents, /<!DOCTYPE html>/);
  assert.match(index.contents, /<h1>smart_thermostat<\/h1>/);
  assert.match(index.contents, /<dt>Capabilities<\/dt><dd>2<\/dd>/);
  assert.match(index.contents, /<link rel="stylesheet" href="styles.css">/);
  assert.match(index.contents, /href="capabilities.html"/);

  const caps = files.find((f) => f.path === `${base}/capabilities.html`);
  assert.ok(caps);
  assert.match(caps.contents, /<code>temperature_sensor<\/code>/);
  assert.match(caps.contents, /chip-actuator">actuator/);
  assert.match(caps.contents, /heating, cooling, off/);

  const telemetry = files.find((f) => f.path === `${base}/telemetry.html`);
  assert.ok(telemetry);
  assert.match(telemetry.contents, /&quot;metric&quot;: &quot;temperature_sensor&quot;/);
  assert.match(telemetry.contents, /&quot;unit&quot;: &quot;celsius&quot;/);

  const styles = files.find((f) => f.path === `${base}/styles.css`);
  assert.ok(styles);
  assert.match(styles.contents, /prefers-color-scheme: dark/);
});

test("docs-site markup escapes and stays self-contained", () => {
  const files = generate();
  for (const file of files.filter((f) => f.path.endsWith(".html"))) {
    assert.doesNotMatch(file.contents, /https?:\/\//, `external URL in ${file.path}`);
    assert.doesNotMatch(file.contents, /<script/, `script tag in ${file.path}`);
  }
});

test("generated artifacts contain no emoji", () => {
  const files = generate();
  const emoji = /\p{Extended_Pictographic}/u;
  for (const file of files) {
    assert.equal(emoji.test(file.contents), false, `emoji found in ${file.path}`);
  }
});
