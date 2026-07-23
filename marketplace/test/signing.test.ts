import assert from "node:assert/strict";
import { test } from "node:test";
import { Publisher, verifySignedPackage } from "../src/signing.js";
import { samplePackage } from "./fixture.js";

test("a signed package verifies against its publisher key", () => {
  const signed = new Publisher().sign(samplePackage());
  assert.equal(verifySignedPackage(signed), true);
});

test("altering package content after signing fails verification", () => {
  const signed = new Publisher().sign(samplePackage());
  signed.pkg.files["README.md"] = "# tampered\n";
  assert.equal(verifySignedPackage(signed), false);
});

test("altering the signature fails verification", () => {
  const signed = new Publisher().sign(samplePackage());
  signed.signature = Buffer.from("not the signature").toString("base64");
  assert.equal(verifySignedPackage(signed), false);
});

test("a publisher key round-trips through export and reload", () => {
  const original = new Publisher();
  const reloaded = new Publisher(original.exportKeys());
  assert.equal(reloaded.publicKeyPem, original.publicKeyPem);
  assert.equal(verifySignedPackage(reloaded.sign(samplePackage())), true);
});

test("a package signed by one publisher does not verify under another key", () => {
  const signed = new Publisher().sign(samplePackage());
  signed.publisherPublicKeyPem = new Publisher().publicKeyPem;
  assert.equal(verifySignedPackage(signed), false);
});
