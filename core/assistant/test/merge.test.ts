import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "yaml";
import { mergeManifestComments } from "../src/merge.js";

const ORIGINAL = `# Reference device manifest.
# The DDL is the single source of truth.
device:
  name: smart_thermostat
  manufacturer: example
  category: thermostat

capabilities:
  # the primary sensor
  temperature_sensor:
    type: sensor
    unit: celsius

security:
  encryption:
    enabled: true
`;

// A model rewrite: same structure plus a new capability, but stripped of all comments.
const PROPOSED = `device:
  name: smart_thermostat
  manufacturer: example
  category: thermostat
capabilities:
  temperature_sensor:
    type: sensor
    unit: celsius
  humidity_sensor:
    type: sensor
    unit: percent
security:
  encryption:
    enabled: true
`;

test("the leading comment block is restored", () => {
  const merged = mergeManifestComments(ORIGINAL, PROPOSED);
  assert.match(merged, /# Reference device manifest\./);
  assert.match(merged, /# The DDL is the single source of truth\./);
});

test("comments on unchanged keys are preserved", () => {
  const merged = mergeManifestComments(ORIGINAL, PROPOSED);
  assert.match(merged, /# the primary sensor/);
});

test("the proposal's new content is kept and semantics are unchanged", () => {
  const merged = mergeManifestComments(ORIGINAL, PROPOSED);
  const data = parse(merged);
  assert.ok(data.capabilities.humidity_sensor, "the added capability survives the merge");
  assert.equal(data.capabilities.humidity_sensor.unit, "percent");
  assert.equal(data.device.category, "thermostat");
});

test("a proposal that fails to parse is returned unchanged", () => {
  const broken = "device: : :\n  bad";
  assert.equal(mergeManifestComments(ORIGINAL, broken), broken);
});
