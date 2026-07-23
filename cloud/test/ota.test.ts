import assert from "node:assert/strict";
import { test } from "node:test";
import { CloudService } from "../src/service.js";
import { FirmwareStore, RolloutCampaign } from "../src/ota.js";
import { FirmwareSigner } from "../src/signing.js";

const artifact = new TextEncoder().encode("thermostat firmware 1.1.0");

test("firmware store accepts signed builds and rejects tampered ones", () => {
  const signer = new FirmwareSigner();
  const store = new FirmwareStore(signer.publicKeyPem);
  const build = signer.sign("thermostat", "1.1.0", artifact);

  store.publish(build, artifact);
  assert.deepEqual(store.get("thermostat", "1.1.0"), build);

  const tampered = new TextEncoder().encode("thermostat firmware 1.1.0 tampered");
  assert.throws(() => store.publish(build, tampered));
});

// The Phase 4 exit criterion: a fleet reports telemetry, then takes a rollback-safe OTA.
test("a fleet reports telemetry and takes a staged OTA", () => {
  const service = new CloudService(() => 1000);
  const fleet = ["t1", "t2", "t3"];
  for (const deviceId of fleet) {
    service.registerDevice({ deviceId, deviceType: "thermostat", firmwareVersion: "1.0.0" });
    service.ingestTelemetry(deviceId, [{ metric: "temperature_sensor", value: 21.5, unit: "celsius" }]);
  }
  for (const deviceId of fleet) {
    assert.equal(service.registry.get(deviceId)?.status, "online");
  }

  const campaign = new RolloutCampaign(service.registry, fleet, "1.1.0", { batchSize: 2 });
  let batch = campaign.nextBatch();
  assert.deepEqual(batch, ["t1", "t2"]);
  for (const deviceId of batch) {
    campaign.report(deviceId, "applied");
  }
  batch = campaign.nextBatch();
  assert.deepEqual(batch, ["t3"]);
  campaign.report("t3", "applied");

  assert.equal(campaign.status().phase, "completed");
  for (const deviceId of fleet) {
    assert.equal(service.registry.get(deviceId)?.firmwareVersion, "1.1.0");
  }
});

test("a failed update rolls the fleet back to the previous version", () => {
  const service = new CloudService(() => 1000);
  const fleet = ["t1", "t2"];
  for (const deviceId of fleet) {
    service.registerDevice({ deviceId, deviceType: "thermostat", firmwareVersion: "1.0.0" });
  }

  const campaign = new RolloutCampaign(service.registry, fleet, "1.1.0", { batchSize: 1, maxFailures: 0 });

  campaign.report(campaign.nextBatch()[0] as string, "applied");
  assert.equal(service.registry.get("t1")?.firmwareVersion, "1.1.0");

  campaign.report(campaign.nextBatch()[0] as string, "failed");

  const status = campaign.status();
  assert.equal(status.phase, "halted");
  assert.equal(status.devices["t1"], "rolledback");
  assert.equal(status.devices["t2"], "failed");
  // The device that had updated is reverted to its previous firmware.
  assert.equal(service.registry.get("t1")?.firmwareVersion, "1.0.0");
});
