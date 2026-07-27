// Signed conformance reports. A conformance authority signs the hash of a report with an
// Ed25519 key so a verdict is tamper-evident and attributable: anyone can confirm the
// report was produced for exactly this device and has not been altered, and that it was
// issued by the holder of a known authority key. This mirrors the firmware signing model
// in the cloud and the package signing model in the marketplace, so the platform speaks
// one language for supply-chain trust. Real Ed25519 keys and signatures come from the Node
// standard library, so the engine stays dependency-free.

import { createHash, createPrivateKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import type { ConformanceReport } from "./types.js";

export interface SignedConformanceReport {
  report: ConformanceReport;
  reportSha256: string;
  authorityPublicKeyPem: string;
  signature: string;
}

// The persisted form of an authority identity: its private and public keys as PEM. The
// private key is a secret; the public key identifies the authority to verifiers.
export interface AuthorityKeys {
  privateKeyPem: string;
  publicKeyPem: string;
}

// Serializes a value with object keys sorted recursively, so a report and any faithful
// re-parse of it produce the same bytes regardless of key insertion order.
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(",")}}`;
}

// The content hash of a report: the SHA-256 of its canonical form, as lowercase hex.
export function reportHash(report: ConformanceReport): string {
  return createHash("sha256").update(canonicalize(report), "utf8").digest("hex");
}

function payload(reportSha256: string): Buffer {
  return Buffer.from(reportSha256, "utf8");
}

// A conformance authority owns an Ed25519 key pair and signs reports with it. Its public
// key identifies the authority; verifiers decide which authority keys they trust.
// Construct with no argument to mint a fresh identity, or with saved keys to reuse one.
export class ConformanceAuthority {
  private readonly privateKey: KeyObject;
  readonly publicKeyPem: string;

  constructor(keys?: AuthorityKeys) {
    if (keys !== undefined) {
      this.privateKey = createPrivateKey(keys.privateKeyPem);
      this.publicKeyPem = keys.publicKeyPem;
      return;
    }
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    this.privateKey = privateKey;
    this.publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  }

  // Exports this authority's keys as PEM so an identity can be saved and reloaded.
  exportKeys(): AuthorityKeys {
    return {
      privateKeyPem: this.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      publicKeyPem: this.publicKeyPem,
    };
  }

  sign(report: ConformanceReport): SignedConformanceReport {
    const reportSha256 = reportHash(report);
    const signature = sign(null, payload(reportSha256), this.privateKey);
    return {
      report,
      reportSha256,
      authorityPublicKeyPem: this.publicKeyPem,
      signature: signature.toString("base64"),
    };
  }
}

// Verifies a signed report against its own content and embedded authority key. Returns
// false if the report was altered after signing (hash mismatch) or the signature does not
// verify. Whether the authority itself is trusted is a separate decision made by the
// verifier against its set of trusted keys.
export function verifySignedReport(signed: SignedConformanceReport): boolean {
  if (reportHash(signed.report) !== signed.reportSha256) {
    return false;
  }
  try {
    return verify(
      null,
      payload(signed.reportSha256),
      signed.authorityPublicKeyPem,
      Buffer.from(signed.signature, "base64"),
    );
  } catch {
    return false;
  }
}
