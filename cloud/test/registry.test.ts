import assert from "node:assert/strict";
import { test } from "node:test";
import { DeviceRegistry } from "../src/registry.js";

test("registers and retrieves a device", () => {
  const registry = new DeviceRegistry();
  const record = registry.register({ deviceId: "a", deviceType: "thermostat" });
  assert.equal(record.status, "provisioned");
  assert.equal(record.firmwareVersion, "0.0.0");
  assert.equal(record.lastSeen, null);
  assert.deepEqual(registry.get("a"), record);
  assert.equal(registry.list().length, 1);
});

test("rejects duplicate registration", () => {
  const registry = new DeviceRegistry();
  registry.register({ deviceId: "a", deviceType: "thermostat" });
  assert.throws(() => registry.register({ deviceId: "a", deviceType: "thermostat" }));
});

test("updates status and firmware, reporting missing devices", () => {
  const registry = new DeviceRegistry();
  registry.register({ deviceId: "a", deviceType: "thermostat", firmwareVersion: "1.0.0" });
  assert.equal(registry.setStatus("a", "online"), true);
  assert.equal(registry.get("a")?.status, "online");
  assert.equal(registry.setFirmware("a", "1.2.3"), true);
  assert.equal(registry.get("a")?.firmwareVersion, "1.2.3");
  assert.equal(registry.setStatus("missing", "online"), false);
});
