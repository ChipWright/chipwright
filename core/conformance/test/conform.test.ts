import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parseManifest } from "@openhome/device-engine";
import { conform, conformManifest } from "../src/conform.js";

// A minimal but valid thermostat manifest, tuned per test to hit each conformance outcome.
function thermostat(body: string): string {
  return `device:\n  name: t\n  category: thermostat\nconnectivity:\n  protocols: [matter]\ncapabilities:\n${body}`;
}

const HVAC = "  hvac:\n    type: actuator\n    modes: [heating, cooling, off]\n";
const TEMP = "  temperature_sensor:\n    type: sensor\n    unit: celsius\n    range: { min: -20, max: 50 }\n";

test("the reference thermostat is conformant", () => {
  const path = fileURLToPath(new URL("../../../examples/thermostat/device.yaml", import.meta.url));
  const report = conformManifest(readFileSync(path, "utf8"));
  assert.equal(report.verdict, "conformant");
  assert.equal(report.matterDeviceType, 0x0301);
  const thermostatCluster = report.clusters.find((c) => c.cluster.id === 0x0201);
  assert.equal(thermostatCluster?.satisfied, true);
  assert.equal(thermostatCluster?.providedBy, "hvac");
});

test("a missing mandatory cluster is nonconformant", () => {
  // No hvac actuator, so the mandatory Thermostat cluster is absent.
  const report = conformManifest(thermostat(TEMP));
  assert.equal(report.verdict, "nonconformant");
  assert.ok(report.diagnostics.some((d) => d.severity === "error" && d.message.includes("Thermostat")));
});

test("a missing optional cluster is conformant with gaps", () => {
  // Has the mandatory Thermostat cluster (hvac) but not the optional TemperatureMeasurement.
  const report = conformManifest(thermostat(HVAC));
  assert.equal(report.verdict, "conformant_with_gaps");
  const optional = report.clusters.find((c) => c.cluster.id === 0x0402);
  assert.equal(optional?.satisfied, false);
  assert.equal(optional?.mandatory, false);
});

test("a violated semantic constraint is nonconformant", () => {
  // hvac without an 'off' mode violates the thermostat constraint.
  const noOff = "  hvac:\n    type: actuator\n    modes: [heating, cooling]\n";
  const report = conformManifest(thermostat(TEMP + noOff));
  assert.equal(report.verdict, "nonconformant");
  assert.ok(report.diagnostics.some((d) => d.message.includes("off")));
});

test("an unknown class is nonconformant", () => {
  const report = conformManifest(
    "device:\n  name: x\n  category: teleporter\nconnectivity:\n  protocols: [matter]\ncapabilities:\n" +
      HVAC,
  );
  assert.equal(report.verdict, "nonconformant");
  assert.equal(report.matterDeviceType, null);
  assert.ok(report.diagnostics.some((d) => d.message.includes("no conformance profile")));
});

test("a fully conformant thermostat has no diagnostics", () => {
  const report = conformManifest(thermostat(TEMP + HVAC));
  assert.equal(report.verdict, "conformant");
  assert.equal(report.diagnostics.length, 0);
});

test("the --class override selects the profile explicitly", () => {
  // Declared category is unknown, but the override judges it as a thermostat.
  const manifest = "device:\n  name: t\n  category: mystery\nconnectivity:\n  protocols: [matter]\ncapabilities:\n" + TEMP + HVAC;
  const report = conformManifest(manifest, "thermostat");
  assert.equal(report.verdict, "conformant");
});

test("parse errors make a manifest nonconformant", () => {
  const report = conformManifest("device:\n  name: 'Bad Name'\n  category: thermostat\n");
  assert.equal(report.verdict, "nonconformant");
});

test("conform() works directly on a parsed IR", () => {
  const { ir } = parseManifest(thermostat(TEMP + HVAC));
  assert.ok(ir);
  const report = conform(ir);
  assert.equal(report.verdict, "conformant");
  assert.equal(report.specVersion, "openhome-conformance-0.1");
});
