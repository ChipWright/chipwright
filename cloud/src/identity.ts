// Device identity. A lightweight certificate authority issues each device an Ed25519 key
// pair and a certificate binding its device id to its public key, signed by the CA. This
// is the trust root the cloud, OTA, and (later) secure boot build on. Real Ed25519 keys
// and signatures come from the Node standard library, so there are no dependencies.

import { generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";

export interface DeviceCertificate {
  deviceId: string;
  publicKeyPem: string;
  issuedAt: number;
  signature: string;
}

export interface DeviceIdentity {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
  certificate: DeviceCertificate;
}

function certificatePayload(deviceId: string, publicKeyPem: string, issuedAt: number): Buffer {
  return Buffer.from(JSON.stringify({ deviceId, publicKeyPem, issuedAt }), "utf8");
}

export class IdentityService {
  private readonly caPrivateKey: KeyObject;
  readonly caPublicKeyPem: string;
  private readonly clock: () => number;

  constructor(clock: () => number = () => Date.now()) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    this.caPrivateKey = privateKey;
    this.caPublicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    this.clock = clock;
  }

  issue(deviceId: string): DeviceIdentity {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const issuedAt = this.clock();
    const signature = sign(null, certificatePayload(deviceId, publicKeyPem, issuedAt), this.caPrivateKey);
    return {
      deviceId,
      publicKeyPem,
      privateKeyPem,
      certificate: { deviceId, publicKeyPem, issuedAt, signature: signature.toString("base64") },
    };
  }
}

// Verifies a certificate was issued by the CA holding caPublicKeyPem and has not been
// altered.
export function verifyCertificate(certificate: DeviceCertificate, caPublicKeyPem: string): boolean {
  const payload = certificatePayload(
    certificate.deviceId,
    certificate.publicKeyPem,
    certificate.issuedAt,
  );
  return verify(null, payload, caPublicKeyPem, Buffer.from(certificate.signature, "base64"));
}
