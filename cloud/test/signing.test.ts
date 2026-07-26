import assert from "node:assert/strict";
import { test } from "node:test";
import { FirmwareSigner, rawEd25519PublicKey, verifyBuild } from "../src/signing.js";

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

test("a signer restored from its private key is the same identity", () => {
  const original = new FirmwareSigner();
  const restored = FirmwareSigner.fromPrivateKeyPem(original.privateKeyPem);
  assert.equal(restored.publicKeyPem, original.publicKeyPem);

  // A build signed by the restored signer verifies against the original public key.
  const build = restored.sign("thermostat", "1.2.0", artifact);
  assert.equal(verifyBuild(build, artifact, original.publicKeyPem), true);
});

test("extracts a 32-byte raw Ed25519 public key for baking into a device", () => {
  const signer = new FirmwareSigner();
  const raw = rawEd25519PublicKey(signer.publicKeyPem);
  assert.equal(raw.length, 32);

  // The extracted raw key matches the SPKI DER tail, which is the raw key for Ed25519.
  const der = Buffer.from(
    signer.publicKeyPem
      .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "")
      .replace(/\s+/g, ""),
    "base64",
  );
  assert.deepEqual(raw, new Uint8Array(der.subarray(der.length - 32)));
});
