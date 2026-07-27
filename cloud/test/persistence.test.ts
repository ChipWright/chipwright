import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyCertificate } from "../src/identity.js";
import { CloudService } from "../src/service.js";
import { FileCloudStore } from "../src/persistence.js";
import { FirmwareSigner } from "../src/signing.js";

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

test("the CA trust root and issued certificates survive a restart", () => {
  const path = tempStatePath();
  const clock = () => 1000;

  const first = new CloudService(clock, undefined, new FileCloudStore(path));
  const caBefore = first.caPublicKeyPem;
  const provisioned = first.provisionDevice({ deviceId: "dev-1", deviceType: "thermostat" });

  const second = new CloudService(clock, undefined, new FileCloudStore(path));
  // The trust root is identical, so a client that cached the CA key still trusts it.
  assert.equal(second.caPublicKeyPem, caBefore);
  // The previously issued certificate is retained and still verifies under the CA.
  const retained = second.getCertificate("dev-1");
  assert.ok(retained);
  assert.equal(verifyCertificate(retained, second.caPublicKeyPem), true);
  assert.equal(verifyCertificate(provisioned.identity.certificate, second.caPublicKeyPem), true);

  rmSync(path, { recursive: true, force: true });
});

test("published firmware and its artifact bytes survive a restart", () => {
  const path = tempStatePath();
  const signer = new FirmwareSigner();
  const artifact = new TextEncoder().encode("thermostat firmware 1.4.0 bytes");
  const build = signer.sign("thermostat", "1.4.0", artifact);

  const first = new CloudService(() => 1000, signer.publicKeyPem, new FileCloudStore(path));
  first.publishFirmware(build, artifact);

  const second = new CloudService(() => 1000, signer.publicKeyPem, new FileCloudStore(path));
  assert.equal(second.latestFirmware("thermostat")?.version, "1.4.0");
  const restored = second.getFirmwareArtifact("thermostat", "1.4.0");
  assert.ok(restored);
  assert.deepEqual(new Uint8Array(restored), artifact);

  rmSync(path, { recursive: true, force: true });
});

test("firmware restored under a different signing key is dropped", () => {
  const path = tempStatePath();
  const signer = new FirmwareSigner();
  const artifact = new TextEncoder().encode("thermostat firmware 1.4.0 bytes");
  const build = signer.sign("thermostat", "1.4.0", artifact);

  const first = new CloudService(() => 1000, signer.publicKeyPem, new FileCloudStore(path));
  first.publishFirmware(build, artifact);

  // A restart configured with a different trust anchor cannot verify the persisted build.
  const other = new FirmwareSigner();
  const second = new CloudService(() => 1000, other.publicKeyPem, new FileCloudStore(path));
  assert.equal(second.getFirmware("thermostat", "1.4.0"), undefined);

  rmSync(path, { recursive: true, force: true });
});

test("an in-flight rollout resumes after a restart", () => {
  const path = tempStatePath();
  const first = new CloudService(() => 1000, undefined, new FileCloudStore(path));
  for (const deviceId of ["r1", "r2"]) {
    first.registerDevice({ deviceId, deviceType: "thermostat", firmwareVersion: "1.0.0" });
  }
  const { id } = first.createRollout(["r1", "r2"], "1.1.0", { batchSize: 1, maxFailures: 0 });
  first.advanceRollout(id);
  first.reportRollout(id, "r1", "applied");

  const second = new CloudService(() => 1000, undefined, new FileCloudStore(path));
  const status = second.rolloutStatus(id);
  assert.equal(status.phase, "in_progress");
  assert.equal(status.devices["r1"], "applied");
  assert.equal(status.devices["r2"], "pending");
  assert.equal(second.registry.get("r1")?.firmwareVersion, "1.1.0");

  // The resumed campaign continues, and a failure still rolls back the applied device.
  second.advanceRollout(id);
  const halted = second.reportRollout(id, "r2", "failed");
  assert.equal(halted.phase, "halted");
  assert.equal(halted.devices["r1"], "rolledback");
  assert.equal(second.registry.get("r1")?.firmwareVersion, "1.0.0");

  rmSync(path, { recursive: true, force: true });
});
