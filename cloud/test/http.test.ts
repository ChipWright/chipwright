import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createCloudServer } from "../src/http.js";
import { CloudService } from "../src/service.js";

async function withServer(run: (base: string) => Promise<void>): Promise<void> {
  const service = new CloudService(() => 1000);
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
