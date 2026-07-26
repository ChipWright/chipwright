import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parseManifest } from "@openhome/device-engine";
import { conform, conformManifest } from "../src/conform.js";
import { MATTER_DEVICE_TYPES } from "../src/matter-device-types.generated.js";

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

test("device-type requirements come from the Matter Device Library", () => {
  // The thermostat's required clusters are the generated library's server clusters, not invented.
  const report = conformManifest(thermostat(TEMP + HVAC));
  const clusterIds = report.clusters.map((c) => c.cluster.id).sort((a, b) => a - b);
  const libraryIds = MATTER_DEVICE_TYPES[0x0301]?.serverClusters.map((c) => c.id).sort((a, b) => a - b);
  assert.deepEqual(clusterIds, libraryIds);
});

test("infrastructure clusters are satisfied by the platform", () => {
  const report = conformManifest(thermostat(TEMP + HVAC));
  const identify = report.clusters.find((c) => c.cluster.id === 0x0003);
  assert.equal(identify?.satisfied, true);
  assert.equal(identify?.providedBy, "platform");
});

test("temperature maps to the Thermostat cluster's LocalTemperature attribute", () => {
  const report = conformManifest(thermostat(TEMP + HVAC));
  const localTemp = report.attributes.find((a) => a.attribute === "LocalTemperature");
  assert.equal(localTemp?.cluster.id, 0x0201);
  assert.equal(localTemp?.capabilityKey, "temperature_sensor");
  assert.equal(localTemp?.present, true);
});

test("a missing mandatory cluster is nonconformant", () => {
  // No hvac actuator, so the mandatory Thermostat cluster (0x0201) is not provided.
  const report = conformManifest(thermostat(TEMP));
  assert.equal(report.verdict, "nonconformant");
  assert.ok(report.diagnostics.some((d) => d.severity === "error" && d.message.includes("Thermostat")));
});

test("a thermostat without a temperature source is conformant with gaps", () => {
  // Has the mandatory Thermostat cluster (hvac) but no LocalTemperature source.
  const report = conformManifest(thermostat(HVAC));
  assert.equal(report.verdict, "conformant_with_gaps");
  assert.ok(report.diagnostics.some((d) => d.severity === "warning" && d.message.includes("LocalTemperature")));
  const localTemp = report.attributes.find((a) => a.attribute === "LocalTemperature");
  assert.equal(localTemp?.present, false);
});

test("a violated semantic constraint is nonconformant", () => {
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
  const manifest =
    "device:\n  name: t\n  category: mystery\nconnectivity:\n  protocols: [matter]\ncapabilities:\n" +
    TEMP +
    HVAC;
  const report = conformManifest(manifest, "thermostat");
  assert.equal(report.verdict, "conformant");
});

test("parse errors make a manifest nonconformant", () => {
  const report = conformManifest("device:\n  name: 'Bad Name'\n  category: thermostat\n");
  assert.equal(report.verdict, "nonconformant");
});

// A second device class proves the engine and profiles generalize beyond the thermostat.
function plug(body: string): string {
  return `device:\n  name: p\n  category: smart_plug\nconnectivity:\n  protocols: [matter]\ncapabilities:\n${body}`;
}
const OUTLET = '  outlet:\n    type: actuator\n    modes: ["on", "off"]\n';

test("the reference smart plug is conformant", () => {
  const path = fileURLToPath(new URL("../../../examples/smart_plug/device.yaml", import.meta.url));
  const report = conformManifest(readFileSync(path, "utf8"));
  assert.equal(report.verdict, "conformant");
  assert.equal(report.matterDeviceType, 0x010a);
  const onOff = report.clusters.find((c) => c.cluster.id === 0x0006);
  assert.equal(onOff?.satisfied, true);
  assert.equal(onOff?.providedBy, "outlet");
});

test("a smart plug without an outlet is nonconformant", () => {
  const report = conformManifest(plug('  status_led:\n    type: actuator\n    modes: ["on", "off"]\n'));
  assert.equal(report.verdict, "nonconformant");
  assert.ok(report.diagnostics.some((d) => d.severity === "error" && d.message.includes("On/Off")));
});

test("a smart plug outlet must support on and off", () => {
  const report = conformManifest(plug('  outlet:\n    type: actuator\n    modes: ["on"]\n'));
  assert.equal(report.verdict, "nonconformant");
  assert.ok(report.diagnostics.some((d) => d.message.includes("'on' and 'off'")));
});

test("the smart plug's mandatory Scenes Management is satisfied by the platform", () => {
  const report = conformManifest(plug(OUTLET));
  const scenes = report.clusters.find((c) => c.cluster.id === 0x0062);
  assert.equal(scenes?.mandatory, true);
  assert.equal(scenes?.providedBy, "platform");
});

test("conform() works directly on a parsed IR", () => {
  const { ir } = parseManifest(thermostat(TEMP + HVAC));
  assert.ok(ir);
  const report = conform(ir);
  assert.equal(report.verdict, "conformant");
  assert.ok(report.specVersion.startsWith("openhome-conformance-0.2"));
  assert.ok(report.specVersion.includes("matter-1.4"));
});
