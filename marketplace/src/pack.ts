// Packing a device project into a package. A project is a directory containing a device
// manifest and, optionally, an chipwright.package.json descriptor that names the metadata
// and the extra files to ship (drivers, tests, docs). With no descriptor, the manifest
// alone is packed and its metadata is derived from the device, so publishing the simplest
// device takes no hand-written metadata. This is the inverse of installing.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEVICE_MANIFEST_FILE,
  isSafePackagePath,
  metaFromManifest,
  type DevicePackage,
  type PackageFiles,
  type PackageMeta,
} from "./package.js";

// The descriptor a project may include to declare its package metadata and file set.
// Every field is optional: the manifest supplies category, and sensible defaults fill
// the rest. Paths in `files` are relative to the project directory.
export interface PackageDescriptor {
  name?: string;
  version?: string;
  description?: string;
  author?: string;
  license?: string;
  keywords?: string[];
  files?: string[];
}

export const DESCRIPTOR_FILE = "chipwright.package.json";

export class PackError extends Error {}

async function readDescriptor(dir: string): Promise<PackageDescriptor> {
  let raw: string;
  try {
    raw = await readFile(join(dir, DESCRIPTOR_FILE), "utf8");
  } catch {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      throw new PackError(`${DESCRIPTOR_FILE} must be a JSON object`);
    }
    return parsed as PackageDescriptor;
  } catch (error) {
    if (error instanceof PackError) {
      throw error;
    }
    throw new PackError(`${DESCRIPTOR_FILE} is not valid JSON`);
  }
}

// Reads a project directory into a package. The manifest is always included; any files
// the descriptor lists are added on top. Metadata comes from the manifest by default and
// is overridden by whatever the descriptor sets. The result is unsigned; sign it with a
// Publisher before publishing.
export async function packDirectory(dir: string): Promise<DevicePackage> {
  const descriptor = await readDescriptor(dir);

  let manifest: string;
  try {
    manifest = await readFile(join(dir, DEVICE_MANIFEST_FILE), "utf8");
  } catch {
    throw new PackError(`project has no ${DEVICE_MANIFEST_FILE}`);
  }

  const overrides: Partial<PackageMeta> = {};
  if (descriptor.name !== undefined) overrides.name = descriptor.name;
  if (descriptor.version !== undefined) overrides.version = descriptor.version;
  if (descriptor.description !== undefined) overrides.description = descriptor.description;
  if (descriptor.author !== undefined) overrides.author = descriptor.author;
  if (descriptor.license !== undefined) overrides.license = descriptor.license;
  if (descriptor.keywords !== undefined) overrides.keywords = descriptor.keywords;
  const meta = metaFromManifest(manifest, overrides);

  const files: PackageFiles = { [DEVICE_MANIFEST_FILE]: manifest };
  for (const path of descriptor.files ?? []) {
    if (path === DEVICE_MANIFEST_FILE) {
      continue;
    }
    if (!isSafePackagePath(path)) {
      throw new PackError(`descriptor lists unsafe file path "${path}"`);
    }
    try {
      files[path] = await readFile(join(dir, path), "utf8");
    } catch {
      throw new PackError(`descriptor lists missing file "${path}"`);
    }
  }

  return { meta, files };
}
