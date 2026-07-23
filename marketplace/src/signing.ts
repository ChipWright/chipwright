// Package signing. A publisher signs the content hash of a package with an Ed25519 key;
// the registry and every installer verify both integrity (the bytes still hash to the
// signed value) and authenticity (the signature is from the embedded publisher key)
// before trusting a package. This mirrors the firmware signing model in the cloud
// package so the platform speaks one language for supply-chain trust.

import { createPrivateKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { contentHash, type DevicePackage } from "./package.js";

export interface SignedPackage {
  pkg: DevicePackage;
  contentSha256: string;
  publisherPublicKeyPem: string;
  signature: string;
}

function payload(contentSha256: string): Buffer {
  return Buffer.from(contentSha256, "utf8");
}

// The persisted form of a publisher identity: its private and public keys as PEM. The
// private key is a secret; the public key identifies the publisher to installers.
export interface PublisherKeys {
  privateKeyPem: string;
  publicKeyPem: string;
}

// A publisher owns an Ed25519 key pair and signs packages with it. Its public key
// identifies the publisher; installers decide which publisher keys they trust. Construct
// with no argument to mint a fresh identity, or with saved keys to reuse one.
export class Publisher {
  private readonly privateKey: KeyObject;
  readonly publicKeyPem: string;

  constructor(keys?: PublisherKeys) {
    if (keys !== undefined) {
      this.privateKey = createPrivateKey(keys.privateKeyPem);
      this.publicKeyPem = keys.publicKeyPem;
      return;
    }
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    this.privateKey = privateKey;
    this.publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  }

  // Exports this publisher's keys as PEM so an identity can be saved and reloaded.
  exportKeys(): PublisherKeys {
    return {
      privateKeyPem: this.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      publicKeyPem: this.publicKeyPem,
    };
  }

  sign(pkg: DevicePackage): SignedPackage {
    const contentSha256 = contentHash(pkg);
    const signature = sign(null, payload(contentSha256), this.privateKey);
    return {
      pkg,
      contentSha256,
      publisherPublicKeyPem: this.publicKeyPem,
      signature: signature.toString("base64"),
    };
  }
}

// Verifies a signed package against its own bytes and embedded publisher key. Returns
// false if the package was altered after signing (hash mismatch) or the signature does
// not verify. This proves the package is intact and self-consistent; whether the
// publisher is trusted is a separate decision made at install time.
export function verifySignedPackage(signed: SignedPackage): boolean {
  if (contentHash(signed.pkg) !== signed.contentSha256) {
    return false;
  }
  try {
    return verify(
      null,
      payload(signed.contentSha256),
      signed.publisherPublicKeyPem,
      Buffer.from(signed.signature, "base64"),
    );
  } catch {
    return false;
  }
}
