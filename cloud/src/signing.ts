// Firmware signing. A signer produces a signed manifest over a firmware artifact's hash;
// devices and the OTA service verify both integrity (the hash matches the bytes) and
// authenticity (the signature is from the trusted signer) before applying an update.

import { createHash, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";

export interface SignedBuild {
  deviceType: string;
  version: string;
  artifactSha256: string;
  signature: string;
}

export function sha256Hex(artifact: Uint8Array): string {
  return createHash("sha256").update(artifact).digest("hex");
}

function buildPayload(deviceType: string, version: string, artifactSha256: string): Buffer {
  return Buffer.from(JSON.stringify({ deviceType, version, artifactSha256 }), "utf8");
}

export class FirmwareSigner {
  private readonly privateKey: KeyObject;
  readonly publicKeyPem: string;

  constructor() {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    this.privateKey = privateKey;
    this.publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  }

  sign(deviceType: string, version: string, artifact: Uint8Array): SignedBuild {
    const artifactSha256 = sha256Hex(artifact);
    const signature = sign(null, buildPayload(deviceType, version, artifactSha256), this.privateKey);
    return { deviceType, version, artifactSha256, signature: signature.toString("base64") };
  }
}

// Verifies a build against the artifact bytes and the signer's public key. Returns false
// if the bytes were tampered with (hash mismatch) or the signature does not verify.
export function verifyBuild(
  build: SignedBuild,
  artifact: Uint8Array,
  signingPublicKeyPem: string,
): boolean {
  if (sha256Hex(artifact) !== build.artifactSha256) {
    return false;
  }
  const payload = buildPayload(build.deviceType, build.version, build.artifactSha256);
  return verify(null, payload, signingPublicKeyPem, Buffer.from(build.signature, "base64"));
}
