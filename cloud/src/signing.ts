// Firmware signing. A signer produces a signed manifest over a firmware artifact's hash;
// devices and the OTA service verify both integrity (the hash matches the bytes) and
// authenticity (the signature is from the trusted signer) before applying an update.

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

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

  // Constructs a signer from an existing Ed25519 private key, or generates a fresh ephemeral
  // one when none is given. A persistent signing identity (the same key across restarts) is
  // required for real OTA: the device trusts one baked-in public key, so builds must be signed
  // by the matching private key every time.
  constructor(privateKey?: KeyObject) {
    if (privateKey === undefined) {
      const generated = generateKeyPairSync("ed25519");
      this.privateKey = generated.privateKey;
    } else {
      this.privateKey = privateKey;
    }
    this.publicKeyPem = createPublicKey(this.privateKey).export({ type: "spki", format: "pem" }).toString();
  }

  static fromPrivateKeyPem(pem: string): FirmwareSigner {
    return new FirmwareSigner(createPrivateKey(pem));
  }

  get privateKeyPem(): string {
    return this.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  }

  sign(deviceType: string, version: string, artifact: Uint8Array): SignedBuild {
    const artifactSha256 = sha256Hex(artifact);
    const signature = sign(null, buildPayload(deviceType, version, artifactSha256), this.privateKey);
    return { deviceType, version, artifactSha256, signature: signature.toString("base64") };
  }
}

// Extracts the raw 32-byte Ed25519 public key from an SPKI PEM. This is the form a device
// bakes in and passes to a compact verifier (e.g. libsodium) that expects the raw key rather
// than a PEM/DER wrapper.
export function rawEd25519PublicKey(publicKeyPem: string): Uint8Array {
  const jwk = createPublicKey(publicKeyPem).export({ format: "jwk" });
  if (jwk.x === undefined) {
    throw new Error("public key is not an Ed25519 (OKP) key");
  }
  return new Uint8Array(Buffer.from(jwk.x, "base64url"));
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
