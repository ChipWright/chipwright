import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createCloudServer, type CloudServerOptions } from "../src/http.js";
import { verifyCertificate } from "../src/identity.js";
import { CloudService } from "../src/service.js";
import { FirmwareSigner } from "../src/signing.js";

async function withServer(
  run: (base: string) => Promise<void>,
  service: CloudService = new CloudService(() => 1000),
  options: CloudServerOptions = {},
): Promise<void> {
  const server = createCloudServer(service, options);
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

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
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

test("firmware artifact bytes and latest version are served for OTA", async () => {
  const signer = new FirmwareSigner();
  const service = new CloudService(() => 1000, signer.publicKeyPem);
  const artifact1 = new TextEncoder().encode("thermostat firmware 1.1.0");
  const artifact2 = new TextEncoder().encode("thermostat firmware 1.2.0 bytes");

  await withServer(async (base) => {
    for (const [version, artifact] of [
      ["1.1.0", artifact1],
      ["1.2.0", artifact2],
    ] as const) {
      const build = signer.sign("thermostat", version, artifact);
      const published = await postJson(`${base}/firmware`, {
        build,
        artifactBase64: Buffer.from(artifact).toString("base64"),
      });
      assert.equal(published.status, 201);
    }

    // The device polls for the newest build and downloads its raw bytes.
    const latest = await (await fetch(`${base}/firmware/thermostat/latest`)).json();
    assert.equal(latest.version, "1.2.0");

    const artifactResponse = await fetch(`${base}/firmware/thermostat/1.2.0/artifact`);
    assert.equal(artifactResponse.status, 200);
    assert.equal(artifactResponse.headers.get("content-type"), "application/octet-stream");
    const downloaded = new Uint8Array(await artifactResponse.arrayBuffer());
    assert.deepEqual(downloaded, artifact2);

    const missing = await fetch(`${base}/firmware/thermostat/9.9.9/artifact`);
    assert.equal(missing.status, 404);
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

test("management routes require the admin token when configured", async () => {
  await withServer(
    async (base) => {
      // No token: rejected before touching the service.
      const anonymous = await postJson(`${base}/devices`, { deviceId: "t1", deviceType: "thermostat" });
      assert.equal(anonymous.status, 401);

      // Wrong token: forbidden.
      const wrong = await fetch(`${base}/devices`, {
        method: "POST",
        headers: { "content-type": "application/json", ...bearer("nope") },
        body: JSON.stringify({ deviceId: "t1", deviceType: "thermostat" }),
      });
      assert.equal(wrong.status, 403);

      // Correct admin token: allowed.
      const ok = await fetch(`${base}/devices`, {
        method: "POST",
        headers: { "content-type": "application/json", ...bearer("admin-secret") },
        body: JSON.stringify({ deviceId: "t1", deviceType: "thermostat" }),
      });
      assert.equal(ok.status, 201);
    },
    new CloudService(() => 1000),
    { adminToken: "admin-secret", deviceToken: "device-secret" },
  );
});

test("device routes accept the device token but not for admin actions", async () => {
  const service = new CloudService(() => 1000);
  service.registerDevice({ deviceId: "d1", deviceType: "thermostat" });

  await withServer(
    async (base) => {
      // The device token drains its own command queue.
      const drain = await fetch(`${base}/devices/d1/commands`, { headers: bearer("device-secret") });
      assert.equal(drain.status, 200);

      // Telemetry ingest is a device action.
      const ingest = await fetch(`${base}/devices/d1/telemetry`, {
        method: "POST",
        headers: { "content-type": "application/json", ...bearer("device-secret") },
        body: JSON.stringify({ samples: [{ metric: "temperature_sensor", value: 20, unit: "celsius" }] }),
      });
      assert.equal(ingest.status, 202);

      // The device token cannot reach an admin route (sending a command).
      const forbidden = await fetch(`${base}/devices/d1/commands`, {
        method: "POST",
        headers: { "content-type": "application/json", ...bearer("device-secret") },
        body: JSON.stringify({ name: "set_mode", args: {} }),
      });
      assert.equal(forbidden.status, 403);

      // The admin token can do both.
      const admin = await fetch(`${base}/devices/d1/commands`, {
        method: "POST",
        headers: { "content-type": "application/json", ...bearer("admin-secret") },
        body: JSON.stringify({ name: "set_mode", args: {} }),
      });
      assert.equal(admin.status, 201);
    },
    service,
    { adminToken: "admin-secret", deviceToken: "device-secret" },
  );
});

test("the CA public key stays open even with tokens configured", async () => {
  await withServer(
    async (base) => {
      const ca = await fetch(`${base}/ca`);
      assert.equal(ca.status, 200);
      const body = await ca.json();
      assert.match(body.caPublicKeyPem, /BEGIN PUBLIC KEY/);
    },
    new CloudService(() => 1000),
    { adminToken: "admin-secret" },
  );
});

test("with no tokens configured every route runs open", async () => {
  await withServer(async (base) => {
    const registered = await postJson(`${base}/devices`, { deviceId: "open1", deviceType: "thermostat" });
    assert.equal(registered.status, 201);
  });
});

// A throwaway self-signed pair (CN=localhost) used only to exercise the TLS wiring.
const TEST_TLS_CERT = `-----BEGIN CERTIFICATE-----
MIICpDCCAYwCCQDagkRdgsnAqzANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDDAls
b2NhbGhvc3QwHhcNMjYwNzI3MDAyMzA4WhcNMzYwNzI0MDAyMzA4WjAUMRIwEAYD
VQQDDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDA
ae7T+Y1CLFcl5qb+SfzZq+HRl3LK7ugFvhgcm9Yuw/++lvw8vInZV68fqHEdfwIj
9gDuTY3dHUavjV1Buwcp9cIK+9xzhaggh0BNl6HmfZ9ZJKtm9V4EUMox6SbGyQTr
Q+CYqTOKUndyNywkyNyh8BKpQ8mw6ct1G5gCkJD292vQbiJvhMhEaKMUE2AoYtT6
pCbtUl55kTMEwW/yvlJm7c8NER/61InALgd2MjwkrY8q2ZaDP4U/VpRoZ6rrAW+b
B5x8/4oo1a3Jbaa/ll5DJBGVz9CQvAfU5KjvhYMRlOOlDrXQHfGhQHv387KmCsHa
dWc9HnqY2wiiW5DaSuplAgMBAAEwDQYJKoZIhvcNAQELBQADggEBAI2MlTXLETvZ
xfEWMRf/V7EUY1C4Y9Zl8pRA5/ATUJyOCJda1gezUjnTiXwdOrfMztZek/oMKAPf
H4yg/RW3Dn1HUax2f6UiHAbXXT5xvRKKcC9p7Kz6gOGYgPEBAuzH4TViOC/JK0Rs
4ximcjW4mV+buwI+RDre+12/gmOSc4HZJJGHOJ5HFK93b70k1vnDmfXL/3QorRDE
T+kYcf+m6FXGf7BzJRxdqJ8AdkiVXTIC0guNMFWD6BpXYnJV8meog0khzCjJFnSN
SuFBmB5kz2A+29aeta2Z5enXIMt+H4onqxHeP97ckFe0IskWgXkU0U4Mpn+TTWTO
rwlEmPRnKOk=
-----END CERTIFICATE-----
`;
const TEST_TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDAae7T+Y1CLFcl
5qb+SfzZq+HRl3LK7ugFvhgcm9Yuw/++lvw8vInZV68fqHEdfwIj9gDuTY3dHUav
jV1Buwcp9cIK+9xzhaggh0BNl6HmfZ9ZJKtm9V4EUMox6SbGyQTrQ+CYqTOKUndy
NywkyNyh8BKpQ8mw6ct1G5gCkJD292vQbiJvhMhEaKMUE2AoYtT6pCbtUl55kTME
wW/yvlJm7c8NER/61InALgd2MjwkrY8q2ZaDP4U/VpRoZ6rrAW+bB5x8/4oo1a3J
baa/ll5DJBGVz9CQvAfU5KjvhYMRlOOlDrXQHfGhQHv387KmCsHadWc9HnqY2wii
W5DaSuplAgMBAAECggEAC5sYJb8KrzAffZDBB9uMndCJSWwaJ3Vrl1UU/TzFGYMG
/Qb8Zel1Yx+v13gAgqfziBnBip4w7WJjrhkXw+w1DWneb20rqego8PVXgpaf1FhF
cUoN8KLiLd51o7cNeLYNTueEN5EVI8W/oKsFRZ67+CST65PEKaCgfgrRC26O3+aH
17/asj7SF8d4FGXjEQSMpPsCYOvsgLhSsa2UXmCPDqeaLM2YpdaCOVbZQPy8dFIu
o5/sQ8/REkLkGcz7ml2MiJd89KCvHQBRl0VJFxd6vFBCnM9O979ulDEd/MQ03Ne6
4e0vN0qnhdcnkZbI6Ku9Z1k/9GcSwklwvKOntQyToQKBgQDk/b9oFuc2xf/E+46I
GTxMpIjDR/13shY6MCFYRNxtF9l50w2kWOxJFpxjXsCzDfd7Pnbda1zaP9+6ow+Q
gu5YbrMuwkkTgTLaGOJfkvZStZWWyw3aNkIFrO/h98pc1K45dOG0uwvTXte9p9r9
ZaxreZmA0u0FBxnnbFvjXmgHzQKBgQDXG8CjSOjtnBk4grqhV6SUSGZshcYC6JWg
botdsEiDgYzdMsZy7SY5jGv5+adz6H7W3ccspN1deVjHNFbIIzlOVyKoIt8mb7go
4Hmjwg55RXpYAsfvSnRq9rFZduizSLbCbleK/gY21iZWQjb74Ek4c/xj8avY0xXV
44hdloyk+QKBgQDGUC9VAQjKud0RBl7g5SIAqjm7DXypDbUMPaSTIkfXvuDcDXjy
DQTNI2Ta9jNinkTnGiitB48JgGnM4+zV1V5/fZd2dlH9L1YP5Z8e8FKdPJ9JUZ80
jOrOqX+yLfu2O4aLQfs6nwbVznx+xoD0FPqmtU/IbmNQiF7ZulE17wufPQKBgDsS
DvOIGRbvD+n51GBsHfDudNoGXlr8HeLBmJnwx+j9EX7I68AxqZaSHjC2QyrMRNCi
dIio+XUq1ptVnyM0sQ73VLgRY3A9q7fl9OFob+sTjkZO9TKcIp4hApDL25koNa/s
9zNfELvMURjM9CZ08AaFq2CSxBs11EA5TIBO0G6ZAoGAX+n51CMVlmyIVn42OG5X
mMGew8FQWAwYuvuomzho2SZKioXymUJjF9SQoOo9fxPP6rwOCE+vhyiPN9ZLKGm2
pG5Fsy8Txrocj1/wjOUVKRiOS+tNoV46oCqbgeIfiUzHRXWPm7nSvpaCfsfLSjoB
z1sO0rGdUtCikht+pbKzPVs=
-----END PRIVATE KEY-----
`;

test("a TLS certificate serves the API over HTTPS", async () => {
  const { Server: HttpsServer, request: httpsRequest } = await import("node:https");
  const server = createCloudServer(new CloudService(() => 1000), {
    tls: { cert: TEST_TLS_CERT, key: TEST_TLS_KEY },
  });
  assert.ok(server instanceof HttpsServer);
  server.listen(0);
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("server did not bind a port");
  }
  try {
    const body = await new Promise<string>((resolve, reject) => {
      const req = httpsRequest(
        { host: "127.0.0.1", port: address.port, path: "/ca", method: "GET", rejectUnauthorized: false },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        },
      );
      req.on("error", reject);
      req.end();
    });
    assert.match(JSON.parse(body).caPublicKeyPem, /BEGIN PUBLIC KEY/);
  } finally {
    server.close();
    await once(server, "close");
  }
});
