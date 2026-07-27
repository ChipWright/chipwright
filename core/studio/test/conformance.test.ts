import assert from "node:assert/strict";
import { test } from "node:test";
import { conformance } from "../src/conformance.js";

const CONFORMANT = `
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

const MISSING_HVAC = `
device:
  name: bare_thermostat
  category: thermostat
capabilities:
  temperature_sensor:
    type: sensor
    unit: celsius
    range: { min: -20, max: 50 }
connectivity:
  protocols: [matter]
`;

const UNKNOWN_CLASS = `
device:
  name: mystery
  category: teleporter
capabilities:
  beam:
    type: actuator
    modes: [on, off]
connectivity:
  protocols: [matter]
`;

test("conformance judges a conformant thermostat", () => {
  const result = conformance(CONFORMANT);
  assert.equal(result.assessed, true);
  assert.equal(result.verdict, "conformant");
  assert.equal(result.report.matterDeviceType, 0x0301);
});

test("conformance flags a thermostat missing a mandatory cluster", () => {
  const result = conformance(MISSING_HVAC);
  assert.equal(result.assessed, true);
  assert.equal(result.verdict, "nonconformant");
});

test("an unknown class is reported as not assessed", () => {
  const result = conformance(UNKNOWN_CLASS);
  assert.equal(result.assessed, false);
});
