import assert from "node:assert/strict";
import { test } from "node:test";
import { generate, validate } from "../src/manifest.js";

const VALID = `
device:
  name: smart_thermostat
  category: thermostat
capabilities:
  temperature_sensor:
    type: sensor
    unit: celsius
    range: { min: -20, max: 50 }
connectivity:
  protocols: [matter]
`;

const INVALID = `
device:
  category: thermostat
capabilities: {}
`;

test("validate accepts a well-formed manifest", () => {
  const result = validate(VALID);
  assert.equal(result.valid, true);
  assert.equal(result.deviceName, "smart_thermostat");
  assert.equal(result.diagnostics.some((d) => d.severity === "error"), false);
});

test("validate reports errors for a malformed manifest", () => {
  const result = validate(INVALID);
  assert.equal(result.valid, false);
  assert.equal(result.deviceName, null);
  assert.ok(result.diagnostics.some((d) => d.severity === "error"));
});

test("generate produces artifacts for a valid manifest", () => {
  const result = generate(VALID);
  assert.equal(result.valid, true);
  assert.ok(result.files.length > 0);
  assert.ok(result.files.some((f) => f.path.endsWith(".h")));
  assert.ok(result.files.some((f) => f.path.startsWith("docs/site/")));
});

test("generate yields no files for an invalid manifest", () => {
  const result = generate(INVALID);
  assert.equal(result.valid, false);
  assert.equal(result.files.length, 0);
});
