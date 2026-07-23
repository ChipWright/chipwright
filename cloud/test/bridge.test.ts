import assert from "node:assert/strict";
import { once } from "node:events";
import { Readable } from "node:stream";
import { test } from "node:test";
import { runBridge } from "../src/bridge/uplink.js";
import { createCloudServer } from "../src/http.js";
import { CloudService } from "../src/service.js";

// Feeds NDJSON telemetry through the real bridge into a live in-process cloud server and
// checks the device shadow reflects the forwarded samples.
test("bridge forwards NDJSON telemetry into the cloud shadow", async () => {
  const service = new CloudService(() => 2000);
  const server = createCloudServer(service);
  server.listen(0);
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("server did not bind a port");
  }
  const base = `http://127.0.0.1:${address.port}`;

  const ndjson = [
    '{"metric":"temperature_sensor","value":21.5,"unit":"celsius"}',
    "not json, should be skipped",
    '{"metric":"temperature_sensor","value":22.0,"unit":"celsius"}',
    "",
  ].join("\n");

  try {
    const forwarded = await runBridge(
      { base, deviceId: "smart_thermostat", deviceType: "thermostat" },
      Readable.from([ndjson]),
    );
    assert.equal(forwarded, 2);

    const shadow = await (await fetch(`${base}/devices/smart_thermostat/shadow`)).json();
    assert.equal(shadow.temperature_sensor.value, 22.0);
    assert.equal(shadow.temperature_sensor.unit, "celsius");

    const device = await (await fetch(`${base}/devices/smart_thermostat`)).json();
    assert.equal(device.status, "online");
  } finally {
    server.close();
    await once(server, "close");
  }
});
