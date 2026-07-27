import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryStore, PackageRegistry } from "../src/registry.js";
import { Publisher } from "../src/signing.js";
import { installPackage, InstallError, verifyForInstall } from "../src/install.js";
import { packDirectory } from "../src/pack.js";
import { parseManifest } from "@chipwright/device-engine";
import { MANIFEST, samplePackage } from "./fixture.js";

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

test("a package packs, publishes, resolves, and installs end to end", async () => {
  const project = await tempDir("chipwright-project-");
  await writeFile(join(project, "device.yaml"), MANIFEST, "utf8");
  await mkdir(join(project, "driver"), { recursive: true });
  await writeFile(join(project, "driver", "thermostat.c"), "// driver\n", "utf8");
  await writeFile(
    join(project, "chipwright.package.json"),
    JSON.stringify({ name: "example.thermostat", version: "1.0.0", files: ["driver/thermostat.c"] }),
    "utf8",
  );

  const pkg = await packDirectory(project);
  assert.equal(pkg.meta.name, "example.thermostat");
  assert.ok("driver/thermostat.c" in pkg.files);

  const registry = new PackageRegistry(new InMemoryStore());
  registry.publish(new Publisher().sign(pkg));

  const target = await tempDir("chipwright-install-");
  const result = await installPackage(registry, "example.thermostat", { dir: target });
  assert.equal(result.version, "1.0.0");
  assert.deepEqual(result.files.sort(), ["device.yaml", "driver/thermostat.c"]);

  const installedManifest = await readFile(join(target, "device.yaml"), "utf8");
  const errors = parseManifest(installedManifest).diagnostics.filter((d) => d.severity === "error");
  assert.deepEqual(errors, []);
});

test("installing an unknown package throws", async () => {
  const registry = new PackageRegistry(new InMemoryStore());
  const dir = await tempDir("chipwright-x-");
  await assert.rejects(() => installPackage(registry, "does.not.exist", { dir }), InstallError);
});

test("an untrusted publisher is rejected, a trusted one is accepted", async () => {
  const registry = new PackageRegistry(new InMemoryStore());
  const publisher = new Publisher();
  registry.publish(publisher.sign(samplePackage()));

  const stranger = new Publisher();
  await assert.rejects(
    () =>
      installPackage(registry, "example.thermostat", {
        dir: "/unused",
        trustedPublishers: [stranger.publicKeyPem],
      }),
    InstallError,
  );

  const target = await tempDir("chipwright-trust-");
  const result = await installPackage(registry, "example.thermostat", {
    dir: target,
    trustedPublishers: [publisher.publicKeyPem],
  });
  assert.equal(result.name, "example.thermostat");
});

test("verifyForInstall rejects a package tampered after signing", () => {
  const signed = new Publisher().sign(samplePackage());
  signed.pkg.meta.description = "swapped out";
  assert.throws(() => verifyForInstall(signed), InstallError);
});
