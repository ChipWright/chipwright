import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { InMemoryStore, PackageRegistry } from "../src/registry.js";
import { createRegistryServer } from "../src/http.js";
import { RegistryClient, RegistryClientError } from "../src/client.js";
import { Publisher } from "../src/signing.js";
import { writeVerifiedPackage } from "../src/install.js";
import { parseManifest } from "@chipwright/device-engine";
import { samplePackage } from "./fixture.js";

// Starts a registry server on an ephemeral port and returns a client for it plus a
// teardown. The registry backs onto an in-memory store so each test is isolated.
async function serve(): Promise<{ client: RegistryClient; close: () => Promise<void> }> {
  const registry = new PackageRegistry(new InMemoryStore());
  const server = createRegistryServer(registry);
  server.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    client: new RegistryClient(`http://127.0.0.1:${port}`),
    close: async () => {
      server.close();
      await once(server, "close");
    },
  };
}

test("publish, search, resolve, and install a package over HTTP", async () => {
  const { client, close } = await serve();
  try {
    await client.publish(new Publisher().sign(samplePackage({ version: "1.0.0" })));
    await client.publish(new Publisher().sign(samplePackage({ version: "1.4.0" })));

    const found = await client.search("thermostat");
    assert.equal(found.length, 1);

    const info = await client.info("example.thermostat");
    assert.deepEqual(info?.versions, ["1.0.0", "1.4.0"]);
    assert.equal(info?.latest, "1.4.0");

    const signed = await client.resolve("example.thermostat");
    assert.equal(signed?.pkg.meta.version, "1.4.0");

    const dir = await mkdtemp(join(tmpdir(), "openhome-http-install-"));
    const result = await writeVerifiedPackage(signed!, { dir });
    assert.equal(result.version, "1.4.0");
    const manifest = await readFile(join(dir, "device.yaml"), "utf8");
    assert.deepEqual(parseManifest(manifest).diagnostics.filter((d) => d.severity === "error"), []);
  } finally {
    await close();
  }
});

test("the server rejects a package whose signature does not verify", async () => {
  const { client, close } = await serve();
  try {
    const signed = new Publisher().sign(samplePackage());
    signed.pkg.files["README.md"] = "# tampered in transit\n";
    await assert.rejects(() => client.publish(signed), RegistryClientError);
  } finally {
    await close();
  }
});

test("resolving an unknown package over HTTP returns undefined", async () => {
  const { client, close } = await serve();
  try {
    assert.equal(await client.resolve("does.not.exist"), undefined);
    assert.equal(await client.info("does.not.exist"), undefined);
  } finally {
    await close();
  }
});
