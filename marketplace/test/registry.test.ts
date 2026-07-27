import assert from "node:assert/strict";
import { test } from "node:test";
import { metaFromManifest, type DevicePackage } from "../src/package.js";
import { compareVersions, InMemoryStore, PackageRegistry, PublishError } from "../src/registry.js";
import { Publisher } from "../src/signing.js";
import { samplePackage } from "./fixture.js";

function newRegistry(): { registry: PackageRegistry; publisher: Publisher } {
  return { registry: new PackageRegistry(new InMemoryStore()), publisher: new Publisher() };
}

// A thermostat missing its mandatory hvac cluster: a valid, parseable device that is
// nonconformant to the Thermostat device type.
const NONCONFORMANT_MANIFEST = `device:
  name: bare_thermostat
  category: thermostat
connectivity:
  protocols: [matter]
capabilities:
  temperature_sensor:
    type: sensor
    unit: celsius
    range: { min: -20, max: 50 }
`;

function nonconformantPackage(): DevicePackage {
  return {
    meta: metaFromManifest(NONCONFORMANT_MANIFEST, {
      name: "example.bare",
      version: "1.0.0",
      description: "A thermostat missing its hvac cluster",
      author: "example",
      license: "MIT",
      keywords: ["thermostat"],
    }),
    files: { "device.yaml": NONCONFORMANT_MANIFEST },
  };
}

test("compareVersions orders versions numerically, not lexically", () => {
  assert.ok(compareVersions("1.2.0", "1.10.0") < 0);
  assert.ok(compareVersions("2.0.0", "1.9.9") > 0);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
});

test("publishing and resolving the latest version", () => {
  const { registry, publisher } = newRegistry();
  registry.publish(publisher.sign(samplePackage({ version: "1.0.0" })));
  registry.publish(publisher.sign(samplePackage({ version: "1.2.0" })));
  registry.publish(publisher.sign(samplePackage({ version: "1.10.0" })));

  assert.deepEqual(registry.versions("example.thermostat"), ["1.0.0", "1.2.0", "1.10.0"]);
  assert.equal(registry.resolve("example.thermostat")?.pkg.meta.version, "1.10.0");
  assert.equal(registry.resolve("example.thermostat@1.2.0")?.pkg.meta.version, "1.2.0");
  assert.equal(registry.resolve("example.thermostat@9.9.9"), undefined);
  assert.equal(registry.resolve("unknown"), undefined);
});

test("republishing an existing version is rejected", () => {
  const { registry, publisher } = newRegistry();
  registry.publish(publisher.sign(samplePackage({ version: "1.0.0" })));
  assert.throws(
    () => registry.publish(publisher.sign(samplePackage({ version: "1.0.0" }))),
    PublishError,
  );
});

test("publishing an invalid package is rejected", () => {
  const { registry, publisher } = newRegistry();
  assert.throws(
    () => registry.publish(publisher.sign(samplePackage({ name: "Bad Name" }))),
    PublishError,
  );
});

test("publishing a package with a broken signature is rejected", () => {
  const { registry, publisher } = newRegistry();
  const signed = publisher.sign(samplePackage());
  signed.pkg.files["README.md"] = "# tampered after signing\n";
  assert.throws(() => registry.publish(signed), PublishError);
});

test("search matches by name, category, and keyword", () => {
  const { registry, publisher } = newRegistry();
  registry.publish(publisher.sign(samplePackage()));

  assert.equal(registry.search("thermostat").length, 1);
  assert.equal(registry.search("hvac").length, 1);
  assert.equal(registry.search("").length, 1);
  assert.equal(registry.search("nonexistent").length, 0);
});

test("a conformance-gated registry rejects a nonconformant device", () => {
  const registry = new PackageRegistry(new InMemoryStore(), { requireConformance: true });
  const publisher = new Publisher();
  assert.throws(
    () => registry.publish(publisher.sign(nonconformantPackage())),
    (error: unknown) => error instanceof PublishError && /nonconformant/.test(error.message),
  );
});

test("a conformance-gated registry still accepts a conformant device", () => {
  const registry = new PackageRegistry(new InMemoryStore(), { requireConformance: true });
  const publisher = new Publisher();
  registry.publish(publisher.sign(samplePackage()));
  assert.equal(registry.resolve("example.thermostat")?.pkg.meta.version, "1.0.0");
});

test("without the gate, a nonconformant device publishes normally", () => {
  const { registry, publisher } = newRegistry();
  registry.publish(publisher.sign(nonconformantPackage()));
  assert.equal(registry.resolve("example.bare")?.pkg.meta.version, "1.0.0");
});
