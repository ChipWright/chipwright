import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CloudService } from "../src/service.js";
import { FileCloudStore } from "../src/persistence.js";

function tempStatePath(): string {
  return join(mkdtempSync(join(tmpdir(), "oh-cloud-")), "state.json");
}

test("registry, shadow, and commands survive a restart", () => {
  const path = tempStatePath();
  const clock = () => 1000;

  const first = new CloudService(clock, undefined, new FileCloudStore(path));
  first.registerDevice({ deviceId: "dev-1", deviceType: "thermostat", firmwareVersion: "1.0.0" });
  first.ingestTelemetry("dev-1", [{ metric: "temperature_sensor", value: 21.5, unit: "celsius" }]);
  first.sendCommand("dev-1", "set_mode", { mode: "cooling" });

  // A fresh service reading the same store resumes the prior state.
  const second = new CloudService(clock, undefined, new FileCloudStore(path));
  const device = second.registry.get("dev-1");
  assert.ok(device);
  assert.equal(device.status, "online");
  assert.equal(device.firmwareVersion, "1.0.0");
  assert.equal(second.getShadow("dev-1")?.["temperature_sensor"]?.value, 21.5);
  const pending = second.commands.pending("dev-1");
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.name, "set_mode");

  rmSync(path, { recursive: true, force: true });
});

test("a missing state file starts the cloud empty", () => {
  const service = new CloudService(() => 1, undefined, new FileCloudStore(tempStatePath()));
  assert.equal(service.registry.list().length, 0);
});

test("draining a command queue is persisted", () => {
  const path = tempStatePath();
  const a = new CloudService(() => 1, undefined, new FileCloudStore(path));
  a.registerDevice({ deviceId: "d", deviceType: "t" });
  a.sendCommand("d", "cmd", {});
  a.drainCommands("d");

  const b = new CloudService(() => 1, undefined, new FileCloudStore(path));
  assert.equal(b.commands.pending("d").length, 0);
  rmSync(path, { recursive: true, force: true });
});

test("without a store, the cloud stays in memory", () => {
  const service = new CloudService();
  service.registerDevice({ deviceId: "x", deviceType: "t" });
  assert.equal(service.snapshot().registry.length, 1);
});
