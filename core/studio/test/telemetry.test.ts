import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import { parseSampleLine, readTelemetry } from "../src/telemetry.js";
import { twinArgs, twinBinaryPath, twinPlan, TWIN_SOURCE_DIR } from "../src/twin.js";

const TWIN_MANIFEST = `
device:
  name: environment_sensor
  category: environment_sensor
capabilities:
  temperature_sensor:
    type: sensor
    unit: celsius
    range: { min: -20, max: 50 }
  humidity:
    type: sensor
    unit: percent
  fan:
    type: actuator
    modes: [low, high]
connectivity:
  protocols: [matter]
`;

test("parseSampleLine parses a telemetry sample", () => {
  const sample = parseSampleLine('{"metric":"temperature_sensor","value":22.5,"unit":"celsius"}');
  assert.deepEqual(sample, { metric: "temperature_sensor", value: 22.5, unit: "celsius" });
});

test("parseSampleLine skips non-telemetry lines", () => {
  assert.equal(parseSampleLine(""), null);
  assert.equal(parseSampleLine("[info] device initializing"), null);
  assert.equal(parseSampleLine('{"metric":"x","value":"not a number","unit":"c"}'), null);
  assert.equal(parseSampleLine('{"metric":"x"}'), null);
});

test("readTelemetry yields only samples from a mixed stream", async () => {
  const stream = Readable.from(
    [
      "[info] device smart_thermostat initializing with 1 sensor(s)",
      '{"metric":"temperature_sensor","value":21.5,"unit":"celsius"}',
      "garbage",
      '{"metric":"temperature_sensor","value":22.0,"unit":"celsius"}',
      "",
    ].join("\n"),
  );

  const samples = [];
  for await (const sample of readTelemetry(stream)) {
    samples.push(sample);
  }

  assert.deepEqual(samples, [
    { metric: "temperature_sensor", value: 21.5, unit: "celsius" },
    { metric: "temperature_sensor", value: 22.0, unit: "celsius" },
  ]);
});

test("twinArgs emits only the flags that were set", () => {
  assert.deepEqual(twinArgs({ binPath: "/x" }), []);
  assert.deepEqual(twinArgs({ binPath: "/x", ticks: 10, intervalMs: 100 }), [
    "--ticks",
    "10",
    "--interval-ms",
    "100",
  ]);
});

test("twinArgs passes the descriptor and fault target", () => {
  assert.deepEqual(twinArgs({ binPath: "/x", descriptorPath: "/tmp/d.desc" }), [
    "--descriptor",
    "/tmp/d.desc",
  ]);
  assert.deepEqual(twinArgs({ binPath: "/x", fault: "stuck", faultAt: 2, faultTarget: "humidity" }), [
    "--fault",
    "stuck",
    "--fault-at",
    "2",
    "--fault-target",
    "humidity",
  ]);
  // A fault target without a fault is not emitted.
  assert.deepEqual(twinArgs({ binPath: "/x", faultTarget: "humidity" }), []);
});

test("twinPlan derives the descriptor and capability lists from a manifest", () => {
  const plan = twinPlan(TWIN_MANIFEST);
  assert.ok(plan);
  assert.equal(plan.deviceName, "environment_sensor");
  assert.deepEqual(plan.sensors, [
    { key: "temperature_sensor", unit: "celsius" },
    { key: "humidity", unit: "percent" },
  ]);
  assert.deepEqual(plan.actuators, ["fan"]);
  assert.equal(
    plan.descriptor,
    "device environment_sensor\n" +
      "sensor temperature_sensor celsius -20 50\n" +
      "sensor humidity percent\n" +
      "actuator fan 2\n",
  );
});

test("twinPlan returns null for a manifest that does not compile", () => {
  assert.equal(twinPlan("device: {}\n"), null);
});

test("twinBinaryPath locates the built twin under the repo root", () => {
  const path = twinBinaryPath("/repo");
  assert.ok(path.startsWith(`/repo/${TWIN_SOURCE_DIR}`));
  assert.ok(path.endsWith("build/twin_studio"));
});

test("twinArgs includes fault details only for a real fault", () => {
  assert.deepEqual(twinArgs({ binPath: "/x", fault: "none", faultAt: 5 }), []);
  assert.deepEqual(twinArgs({ binPath: "/x", fault: "stuck", faultAt: 5 }), [
    "--fault",
    "stuck",
    "--fault-at",
    "5",
  ]);
  assert.deepEqual(twinArgs({ binPath: "/x", fault: "offset", faultAt: 3, offset: 4.5 }), [
    "--fault",
    "offset",
    "--fault-at",
    "3",
    "--offset",
    "4.5",
  ]);
});
