import assert from "node:assert/strict";
import { test } from "node:test";
import { parseManifest } from "../src/parse.js";
import { hasErrors } from "../src/schema.js";

const VALID = `
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
  protocols: [matter, thread]
security:
  encryption:
    enabled: true
`;

test("accepts a well-formed manifest and normalizes it", () => {
  const { ir, diagnostics } = parseManifest(VALID);
  assert.equal(hasErrors(diagnostics), false);
  assert.ok(ir);
  assert.equal(ir.device.name, "smart_thermostat");
  assert.equal(ir.capabilities.length, 2);
  assert.deepEqual(ir.connectivity.protocols, ["matter", "thread"]);
  assert.equal(ir.security.encryption.enabled, true);
});

test("rejects a non-identifier device name", () => {
  const { ir, diagnostics } = parseManifest(`
device:
  name: Smart Thermostat
  category: thermostat
connectivity:
  protocols: [matter]
`);
  assert.equal(ir, null);
  assert.ok(diagnostics.some((d) => d.path === "device.name" && d.severity === "error"));
});

test("rejects an actuator with no modes", () => {
  const { diagnostics } = parseManifest(`
device:
  name: fan
  category: fan
capabilities:
  motor:
    type: actuator
    modes: []
connectivity:
  protocols: [wifi]
`);
  assert.ok(diagnostics.some((d) => d.path === "capabilities.motor.modes"));
});

test("rejects an inverted sensor range", () => {
  const { diagnostics } = parseManifest(`
device:
  name: probe
  category: sensor
capabilities:
  temp:
    type: sensor
    unit: celsius
    range: { min: 50, max: -20 }
connectivity:
  protocols: [matter]
`);
  assert.ok(diagnostics.some((d) => d.path === "capabilities.temp.range"));
});

test("warns on unknown protocols but still parses", () => {
  const { ir, diagnostics } = parseManifest(`
device:
  name: gadget
  category: misc
connectivity:
  protocols: [matter, lorawan]
`);
  assert.ok(ir);
  assert.deepEqual(ir.connectivity.protocols, ["matter"]);
  assert.deepEqual(ir.connectivity.unknownProtocols, ["lorawan"]);
  assert.ok(diagnostics.some((d) => d.severity === "warning" && d.message.includes("lorawan")));
});

test("reports invalid YAML as a diagnostic", () => {
  const { ir, diagnostics } = parseManifest("device: : :\n  bad");
  assert.equal(ir, null);
  assert.ok(diagnostics.some((d) => d.message.startsWith("invalid YAML")));
});
