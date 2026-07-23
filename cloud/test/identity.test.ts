import assert from "node:assert/strict";
import { test } from "node:test";
import { IdentityService, verifyCertificate } from "../src/identity.js";

test("issues a device identity with a CA-signed certificate", () => {
  const ca = new IdentityService(() => 1000);
  const identity = ca.issue("device-1");

  assert.equal(identity.deviceId, "device-1");
  assert.match(identity.publicKeyPem, /BEGIN PUBLIC KEY/);
  assert.match(identity.privateKeyPem, /BEGIN PRIVATE KEY/);
  assert.equal(identity.certificate.issuedAt, 1000);
  assert.equal(verifyCertificate(identity.certificate, ca.caPublicKeyPem), true);
});

test("rejects a tampered certificate", () => {
  const ca = new IdentityService();
  const identity = ca.issue("device-1");
  const forged = { ...identity.certificate, deviceId: "attacker" };
  assert.equal(verifyCertificate(forged, ca.caPublicKeyPem), false);
});

test("rejects a certificate under a different CA", () => {
  const ca = new IdentityService();
  const other = new IdentityService();
  const identity = ca.issue("device-1");
  assert.equal(verifyCertificate(identity.certificate, other.caPublicKeyPem), false);
});
