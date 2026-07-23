// Parsing untrusted JSON into a SignedPackage shape. This checks structure only; it does
// not verify the signature or validate the manifest, which the registry and installer do.
// Both the HTTP server (reading a publish body) and the client (reading a fetched
// package) parse through here so a malformed payload is rejected before any crypto runs.

import { type DevicePackage, type PackageFiles, type PackageMeta } from "./package.js";
import { type SignedPackage } from "./signing.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMeta(value: unknown): PackageMeta | null {
  if (!isRecord(value)) {
    return null;
  }
  const { name, version, description, category, author, license, keywords } = value;
  if (
    typeof name !== "string" ||
    typeof version !== "string" ||
    typeof description !== "string" ||
    typeof category !== "string" ||
    typeof author !== "string" ||
    typeof license !== "string" ||
    !Array.isArray(keywords) ||
    !keywords.every((k) => typeof k === "string")
  ) {
    return null;
  }
  return { name, version, description, category, author, license, keywords };
}

function parseFiles(value: unknown): PackageFiles | null {
  if (!isRecord(value)) {
    return null;
  }
  const files: PackageFiles = {};
  for (const [path, content] of Object.entries(value)) {
    if (typeof content !== "string") {
      return null;
    }
    files[path] = content;
  }
  return files;
}

function parsePackage(value: unknown): DevicePackage | null {
  if (!isRecord(value)) {
    return null;
  }
  const meta = parseMeta(value["meta"]);
  const files = parseFiles(value["files"]);
  if (meta === null || files === null) {
    return null;
  }
  return { meta, files };
}

// Parses a value into a SignedPackage, or returns null if the shape is wrong.
export function parseSignedPackage(value: unknown): SignedPackage | null {
  if (!isRecord(value)) {
    return null;
  }
  const pkg = parsePackage(value["pkg"]);
  const { contentSha256, publisherPublicKeyPem, signature } = value;
  if (
    pkg === null ||
    typeof contentSha256 !== "string" ||
    typeof publisherPublicKeyPem !== "string" ||
    typeof signature !== "string"
  ) {
    return null;
  }
  return { pkg, contentSha256, publisherPublicKeyPem, signature };
}
