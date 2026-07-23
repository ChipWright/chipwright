import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DESIGNER_PROTOCOLS,
  DEVICE_TEMPLATES,
  emptyForm,
  formToManifest,
  manifestToForm,
  type DeviceForm,
} from "../src/designer.js";
import { validate } from "../src/manifest.js";

const MANIFEST = `
device:
  name: smart_thermostat
  manufacturer: example
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
power:
  battery:
    rechargeable: true
security:
  encryption:
    enabled: true
`;

test("manifestToForm reads every section into the form", () => {
  const form = manifestToForm(MANIFEST);
  assert.equal(form.name, "smart_thermostat");
  assert.equal(form.manufacturer, "example");
  assert.equal(form.category, "thermostat");
  assert.deepEqual(form.protocols, ["matter", "thread"]);
  assert.deepEqual(form.battery, { enabled: true, rechargeable: true });
  assert.equal(form.encryption, true);

  const sensor = form.capabilities.find((c) => c.key === "temperature_sensor");
  assert.ok(sensor && sensor.kind === "sensor");
  assert.equal(sensor.unit, "celsius");
  assert.equal(sensor.min, -20);
  assert.equal(sensor.max, 50);

  const actuator = form.capabilities.find((c) => c.key === "hvac");
  assert.ok(actuator && actuator.kind === "actuator");
  assert.deepEqual(actuator.modes, ["heating", "cooling", "off"]);
});

test("form round-trips through manifest YAML unchanged", () => {
  const form = manifestToForm(MANIFEST);
  const yaml = formToManifest(form);
  assert.deepEqual(manifestToForm(yaml), form);
});

test("formToManifest produces a valid manifest", () => {
  const form = manifestToForm(MANIFEST);
  const result = validate(formToManifest(form));
  assert.equal(result.valid, true);
  assert.equal(result.diagnostics.some((d) => d.severity === "error"), false);
});

test("a form built from scratch generates a valid manifest", () => {
  const form: DeviceForm = {
    name: "smart_plug",
    category: "plug",
    manufacturer: "",
    capabilities: [
      { key: "power_switch", kind: "actuator", modes: ["on", "off"] },
      { key: "power_sensor", kind: "sensor", unit: "watt", min: 0, max: 3000 },
    ],
    protocols: ["matter"],
    battery: { enabled: false, rechargeable: false },
    encryption: true,
  };
  const yaml = formToManifest(form);
  const result = validate(yaml);
  assert.equal(result.valid, true);
  assert.equal(result.deviceName, "smart_plug");
  // No battery section is emitted when the device is not battery powered.
  assert.equal(manifestToForm(yaml).battery.enabled, false);
});

test("emptyForm is empty and the protocol catalog is non-empty", () => {
  assert.deepEqual(emptyForm().capabilities, []);
  assert.ok(DESIGNER_PROTOCOLS.includes("matter"));
});

test("every device template produces a valid manifest", () => {
  assert.ok(DEVICE_TEMPLATES.length >= 1);
  for (const template of DEVICE_TEMPLATES) {
    const result = validate(formToManifest(template.form));
    assert.equal(result.valid, true, `template ${template.id} is invalid`);
    assert.equal(
      result.diagnostics.some((d) => d.severity === "error"),
      false,
      `template ${template.id} has errors`,
    );
  }
});
