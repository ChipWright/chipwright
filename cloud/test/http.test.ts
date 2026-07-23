import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createCloudServer } from "../src/http.js";
import { verifyCertificate } from "../src/identity.js";
import { CloudService } from "../src/service.js";
import { FirmwareSigner } from "../src/signing.js";

async function withServer(
  run: (base: string) => Promise<void>,
  service: CloudService = new CloudService(() => 1000),
): Promise<void> {
  const server = createCloudServer(service);
  server.listen(0);
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("server did not bind a port");
  }
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("device lifecycle over HTTP", async () => {
  await withServer(async (base) => {
    const registered = await postJson(`${base}/devices`, { deviceId: "t1", deviceType: "thermostat" });
    assert.equal(registered.status, 201);

    const ingested = await postJson(`${base}/devices/t1/telemetry`, {
      samples: [{ metric: "temperature_sensor", value: 21.5, unit: "celsius" }],
    });
    assert.equal(ingested.status, 202);

    const shadowResponse = await fetch(`${base}/devices/t1/shadow`);
    assert.equal(shadowResponse.status, 200);
    const shadow = await shadowResponse.json();
    assert.equal(shadow.temperature_sensor.value, 21.5);
    assert.equal(shadow.temperature_sensor.unit, "celsius");

    const deviceResponse = await fetch(`${base}/devices/t1`);
    const device = await deviceResponse.json();
    assert.equal(device.status, "online");

    const queued = await postJson(`${base}/devices/t1/commands`, {
      name: "set_mode",
      args: { mode: "cooling" },
    });
    assert.equal(queued.status, 201);

    const firstDrain = await (await fetch(`${base}/devices/t1/commands`)).json();
    assert.equal(firstDrain.length, 1);
    assert.equal(firstDrain[0].name, "set_mode");

    const secondDrain = await (await fetch(`${base}/devices/t1/commands`)).json();
    assert.deepEqual(secondDrain, []);
  });
});

test("rejects telemetry for an unknown device", async () => {
  await withServer(async (base) => {
    const response = await postJson(`${base}/devices/ghost/telemetry`, { samples: [] });
    assert.equal(response.status, 404);
  });
});

test("rejects a malformed device registration", async () => {
  await withServer(async (base) => {
    const response = await postJson(`${base}/devices`, { deviceType: "thermostat" });
    assert.equal(response.status, 400);
  });
});

test("provisioning issues a CA-verifiable identity over HTTP", async () => {
  await withServer(async (base) => {
    const ca = await (await fetch(`${base}/ca`)).json();
    assert.match(ca.caPublicKeyPem, /BEGIN PUBLIC KEY/);

    const response = await postJson(`${base}/provision`, { deviceId: "p1", deviceType: "thermostat" });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.device.deviceId, "p1");
    assert.match(result.identity.privateKeyPem, /BEGIN PRIVATE KEY/);
    assert.equal(verifyCertificate(result.identity.certificate, ca.caPublicKeyPem), true);
  });
});

test("firmware publish rejects tampered artifacts and serves verified builds", async () => {
  const signer = new FirmwareSigner();
  const service = new CloudService(() => 1000, signer.publicKeyPem);
  const artifact = new TextEncoder().encode("thermostat firmware 1.1.0");
  const build = signer.sign("thermostat", "1.1.0", artifact);

  await withServer(async (base) => {
    const tampered = await postJson(`${base}/firmware`, {
      build,
      artifactBase64: Buffer.from("not the firmware").toString("base64"),
    });
    assert.equal(tampered.status, 400);

    const published = await postJson(`${base}/firmware`, {
      build,
      artifactBase64: Buffer.from(artifact).toString("base64"),
    });
    assert.equal(published.status, 201);

    const fetched = await (await fetch(`${base}/firmware/thermostat/1.1.0`)).json();
    assert.equal(fetched.version, "1.1.0");
  }, service);
});

test("a rollout campaign runs and rolls back over HTTP", async () => {
  const service = new CloudService(() => 1000);
  for (const deviceId of ["r1", "r2"]) {
    service.registerDevice({ deviceId, deviceType: "thermostat", firmwareVersion: "1.0.0" });
  }

  await withServer(async (base) => {
    const created = await (
      await postJson(`${base}/rollouts`, {
        deviceIds: ["r1", "r2"],
        targetVersion: "1.1.0",
        batchSize: 1,
        maxFailures: 0,
      })
    ).json();
    const id = created.id;

    const firstBatch = await (await postJson(`${base}/rollouts/${id}/next-batch`, {})).json();
    assert.deepEqual(firstBatch.batch, ["r1"]);
    await postJson(`${base}/rollouts/${id}/report`, { deviceId: "r1", outcome: "applied" });
    assert.equal(service.registry.get("r1")?.firmwareVersion, "1.1.0");

    await postJson(`${base}/rollouts/${id}/next-batch`, {});
    const halted = await (
      await postJson(`${base}/rollouts/${id}/report`, { deviceId: "r2", outcome: "failed" })
    ).json();
    assert.equal(halted.phase, "halted");
    assert.equal(halted.devices.r1, "rolledback");
    assert.equal(service.registry.get("r1")?.firmwareVersion, "1.0.0");
  }, service);
});
