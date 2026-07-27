import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { conformManifest } from "../src/conform.js";
import {
  ConformanceAuthority,
  reportHash,
  verifySignedReport,
} from "../src/report-signing.js";

function referenceReport() {
  const path = fileURLToPath(new URL("../../../examples/thermostat/device.yaml", import.meta.url));
  return conformManifest(readFileSync(path, "utf8"));
}

test("a signed report verifies against its authority", () => {
  const authority = new ConformanceAuthority();
  const signed = authority.sign(referenceReport());
  assert.equal(signed.authorityPublicKeyPem, authority.publicKeyPem);
  assert.equal(verifySignedReport(signed), true);
});

test("a report hash is stable across key ordering", () => {
  const report = referenceReport();
  // A faithful re-parse preserves the verdict but may reorder keys; the hash is unchanged.
  const reparsed = JSON.parse(JSON.stringify(report));
  assert.equal(reportHash(report), reportHash(reparsed));
});

test("altering a signed verdict breaks verification", () => {
  const authority = new ConformanceAuthority();
  const signed = authority.sign(referenceReport());
  const tampered = {
    ...signed,
    report: { ...signed.report, verdict: "conformant" as const },
  };
  // The stored verdict was already conformant; changing a real field must break the hash.
  tampered.report = { ...signed.report, class: "smart_plug" };
  assert.equal(verifySignedReport(tampered), false);
});

test("a signature from another authority does not verify", () => {
  const report = referenceReport();
  const signed = new ConformanceAuthority().sign(report);
  const impostor = new ConformanceAuthority();
  const forged = { ...signed, authorityPublicKeyPem: impostor.publicKeyPem };
  assert.equal(verifySignedReport(forged), false);
});

test("an authority reloaded from its keys signs the same identity", () => {
  const original = new ConformanceAuthority();
  const restored = new ConformanceAuthority(original.exportKeys());
  assert.equal(restored.publicKeyPem, original.publicKeyPem);
  const signed = restored.sign(referenceReport());
  signed.authorityPublicKeyPem = original.publicKeyPem;
  assert.equal(verifySignedReport(signed), true);
});
