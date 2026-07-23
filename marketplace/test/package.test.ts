import assert from "node:assert/strict";
import { test } from "node:test";
import {
  contentHash,
  isSafePackagePath,
  metaFromManifest,
  validatePackage,
  type DevicePackage,
} from "../src/package.js";
import { MANIFEST, samplePackage } from "./fixture.js";

test("a well-formed package validates cleanly", () => {
  assert.deepEqual(validatePackage(samplePackage()), []);
});

test("content hash is stable across file and keyword ordering", () => {
  const a = samplePackage({ keywords: ["hvac", "thermostat"] });
  const b: DevicePackage = {
    meta: { ...a.meta, keywords: ["thermostat", "hvac"] },
    files: { "README.md": a.files["README.md"] ?? "", "device.yaml": a.files["device.yaml"] ?? "" },
  };
  assert.equal(contentHash(a), contentHash(b));
});

test("content hash changes when any file content changes", () => {
  const a = samplePackage();
  const b: DevicePackage = { meta: a.meta, files: { ...a.files, "README.md": "# Changed\n" } };
  assert.notEqual(contentHash(a), contentHash(b));
});

test("a package without a device manifest is rejected", () => {
  const pkg: DevicePackage = { meta: samplePackage().meta, files: { "README.md": "# no manifest\n" } };
  assert.ok(validatePackage(pkg).some((p) => p.includes("device.yaml")));
});

test("an invalid device manifest is reported", () => {
  const pkg = samplePackage();
  pkg.files["device.yaml"] = "device:\n  manufacturer: example\n";
  assert.ok(validatePackage(pkg).some((p) => p.includes("device.yaml")));
});

test("a bad package name is rejected", () => {
  assert.ok(validatePackage(samplePackage({ name: "Not Valid" })).some((p) => p.includes("name")));
});

test("a non-semver version is rejected", () => {
  assert.ok(validatePackage(samplePackage({ version: "1.0" })).some((p) => p.includes("version")));
});

test("a category that disagrees with the manifest is rejected", () => {
  assert.ok(
    validatePackage(samplePackage({ category: "light" })).some((p) => p.includes("category")),
  );
});

test("an unsafe file path is rejected", () => {
  const pkg = samplePackage();
  pkg.files["../escape.txt"] = "malicious";
  assert.ok(validatePackage(pkg).some((p) => p.includes("unsafe")));
});

test("path safety rejects traversal and absolute paths", () => {
  assert.equal(isSafePackagePath("driver/thermostat.c"), true);
  assert.equal(isSafePackagePath("../secret"), false);
  assert.equal(isSafePackagePath("/etc/passwd"), false);
  assert.equal(isSafePackagePath("a/../../b"), false);
  assert.equal(isSafePackagePath("C:\\win"), false);
});

test("metadata is derived from the manifest by default", () => {
  const meta = metaFromManifest(MANIFEST);
  assert.equal(meta.category, "thermostat");
  assert.equal(meta.name, "smart.thermostat");
});
