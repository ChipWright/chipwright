import assert from "node:assert/strict";
import { test } from "node:test";
import { FirmwareSigner, verifyBuild } from "../src/signing.js";

const artifact = new TextEncoder().encode("firmware image bytes v1");

test("verifies a correctly signed build", () => {
  const signer = new FirmwareSigner();
  const build = signer.sign("thermostat", "1.1.0", artifact);
  assert.equal(build.version, "1.1.0");
  assert.equal(verifyBuild(build, artifact, signer.publicKeyPem), true);
});

test("rejects a tampered artifact", () => {
  const signer = new FirmwareSigner();
  const build = signer.sign("thermostat", "1.1.0", artifact);
  const tampered = new TextEncoder().encode("firmware image bytes v1 with malware");
  assert.equal(verifyBuild(build, tampered, signer.publicKeyPem), false);
});

test("rejects a build signed by a different signer", () => {
  const signer = new FirmwareSigner();
  const attacker = new FirmwareSigner();
  const build = attacker.sign("thermostat", "1.1.0", artifact);
  assert.equal(verifyBuild(build, artifact, signer.publicKeyPem), false);
});
