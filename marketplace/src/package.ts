// The package format for the Chipwright marketplace. A package bundles a device
// definition (the DDL) together with any drivers, tests, and documentation that ship
// with it, plus the metadata needed to find and install it. The device manifest is the
// only required file: a package that does not describe a device is not a device package.
//
// Every package has a deterministic content hash over its metadata and files, so the
// same package always hashes to the same value regardless of key or file ordering. That
// hash is what a publisher signs and what an installer re-checks, which is how integrity
// is enforced end to end.

import { createHash } from "node:crypto";
import { parseManifest } from "@chipwright/device-engine";

// The manifest file every device package must contain, interpreted by the device engine.
export const DEVICE_MANIFEST_FILE = "device.yaml";

// A package name is a lowercase dotted or dashed identifier, e.g. "example.thermostat".
const NAME_PATTERN = /^[a-z][a-z0-9]*([._-][a-z0-9]+)*$/;

// Versions are plain three-part semantic versions. Ranges are resolved elsewhere; a
// published package always carries an exact version.
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export interface PackageMeta {
  name: string;
  version: string;
  description: string;
  category: string;
  author: string;
  license: string;
  keywords: string[];
}

// The file set of a package, keyed by forward-slash relative path. Contents are UTF-8
// text; the DDL, drivers, and tests the platform produces are all text.
export type PackageFiles = Record<string, string>;

export interface DevicePackage {
  meta: PackageMeta;
  files: PackageFiles;
}

// A file path is safe to write under a target directory only if it is relative and does
// not escape it. Package installers rely on this to avoid writing outside the target.
export function isSafePackagePath(path: string): boolean {
  if (path.length === 0 || path.startsWith("/") || path.includes("\\")) {
    return false;
  }
  if (/^[a-zA-Z]:/.test(path)) {
    return false;
  }
  return path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

// Validates a package's structure and confirms its device manifest still compiles. This
// is the gate both publishing and installing run so that neither a bad publish nor a
// tampered download can put an invalid device into a project. Returns the list of
// problems; an empty list means the package is well formed.
export function validatePackage(pkg: DevicePackage): string[] {
  const problems: string[] = [];
  const { meta, files } = pkg;

  if (!NAME_PATTERN.test(meta.name)) {
    problems.push(`invalid package name "${meta.name}"`);
  }
  if (!VERSION_PATTERN.test(meta.version)) {
    problems.push(`invalid version "${meta.version}" (expected MAJOR.MINOR.PATCH)`);
  }
  if (meta.description.trim().length === 0) {
    problems.push("description is required");
  }
  if (meta.license.trim().length === 0) {
    problems.push("license is required");
  }

  for (const path of Object.keys(files)) {
    if (!isSafePackagePath(path)) {
      problems.push(`unsafe file path "${path}"`);
    }
  }

  const manifest = files[DEVICE_MANIFEST_FILE];
  if (manifest === undefined) {
    problems.push(`package is missing ${DEVICE_MANIFEST_FILE}`);
    return problems;
  }

  const { ir, diagnostics } = parseManifest(manifest);
  const errors = diagnostics.filter((d) => d.severity === "error");
  for (const error of errors) {
    problems.push(`${DEVICE_MANIFEST_FILE}: ${error.path ? `${error.path}: ` : ""}${error.message}`);
  }
  if (ir !== null && meta.category !== ir.device.category) {
    problems.push(
      `metadata category "${meta.category}" does not match manifest category "${ir.device.category}"`,
    );
  }

  return problems;
}

// Derives package metadata from a device manifest, filling name, category, and a
// description from the device itself. Callers can override any field afterwards; this is
// the sensible default so publishing a bare manifest requires no hand-written metadata.
export function metaFromManifest(manifest: string, overrides: Partial<PackageMeta> = {}): PackageMeta {
  const { ir } = parseManifest(manifest);
  const deviceName = ir?.device.name ?? "device";
  const category = ir?.device.category ?? "unknown";
  const base: PackageMeta = {
    name: deviceName.replace(/_/g, "."),
    version: "0.1.0",
    description: `${category} device`,
    category,
    author: "",
    license: "MIT",
    keywords: [category],
  };
  return { ...base, ...overrides };
}

// Produces the canonical byte string a package hashes over: metadata with sorted keys
// and files sorted by path. Two packages with identical content always serialize
// identically, so the hash is stable across construction order.
function canonicalize(pkg: DevicePackage): string {
  const meta = pkg.meta;
  const canonicalMeta = {
    name: meta.name,
    version: meta.version,
    description: meta.description,
    category: meta.category,
    author: meta.author,
    license: meta.license,
    keywords: [...meta.keywords].sort(),
  };
  const files = Object.keys(pkg.files)
    .sort()
    .map((path) => [path, pkg.files[path]] as const);
  return JSON.stringify({ meta: canonicalMeta, files });
}

// The content hash of a package: the SHA-256 of its canonical form, as lowercase hex.
export function contentHash(pkg: DevicePackage): string {
  return createHash("sha256").update(canonicalize(pkg), "utf8").digest("hex");
}
