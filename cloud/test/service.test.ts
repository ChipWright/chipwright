import assert from "node:assert/strict";
import { test } from "node:test";
import { CloudService } from "../src/service.js";

test("ingesting telemetry updates the shadow and marks the device online", () => {
  const service = new CloudService(() => 5000);
  service.registerDevice({ deviceId: "t", deviceType: "thermostat" });
  service.ingestTelemetry("t", [{ metric: "temperature_sensor", value: 21.5, unit: "celsius" }]);

  const shadow = service.getShadow("t");
  assert.ok(shadow);
  assert.equal(shadow.temperature_sensor?.value, 21.5);
  assert.equal(service.registry.get("t")?.status, "online");
  assert.equal(service.registry.get("t")?.lastSeen, 5000);
});

test("rejects telemetry and commands for unknown devices", () => {
  const service = new CloudService();
  assert.throws(() => service.ingestTelemetry("ghost", []));
  assert.throws(() => service.sendCommand("ghost", "on", {}));
});

test("commands round-trip and drain once", () => {
  const service = new CloudService(() => 1);
  service.registerDevice({ deviceId: "t", deviceType: "thermostat" });
  service.sendCommand("t", "set_mode", { mode: "cooling" });

  const drained = service.drainCommands("t");
  assert.equal(drained.length, 1);
  assert.equal(drained[0]?.name, "set_mode");
  assert.equal(service.drainCommands("t").length, 0);
});
