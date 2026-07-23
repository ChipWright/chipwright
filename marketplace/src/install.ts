// Installing a package. Resolving a specifier is the registry's job; this module is the
// trust boundary that turns a resolved package into files on disk. It re-verifies the
// signature and package validity rather than trusting that publishing did, enforces the
// caller's set of trusted publishers, and refuses any file path that would escape the
// target directory. Only after all of that does it write anything.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isSafePackagePath, validatePackage } from "./package.js";
import { verifySignedPackage, type SignedPackage } from "./signing.js";
import { type PackageRegistry } from "./registry.js";

export interface InstallOptions {
  dir: string;
  // When provided, the package's publisher key must be one of these PEM strings, so an
  // installer only accepts packages from publishers it has chosen to trust. When
  // omitted, any package with a valid self-consistent signature is accepted.
  trustedPublishers?: string[];
}

export interface InstallResult {
  name: string;
  version: string;
  publisherPublicKeyPem: string;
  files: string[];
}

export class InstallError extends Error {}

// Verifies a signed package is intact, well formed, and (if a trust set is given) from a
// trusted publisher. Throws InstallError describing the first failure. Shared by the
// install-to-disk path and any caller that wants to check a package without writing it.
export function verifyForInstall(signed: SignedPackage, trustedPublishers?: string[]): void {
  if (!verifySignedPackage(signed)) {
    throw new InstallError("package signature does not verify");
  }
  const problems = validatePackage(signed.pkg);
  if (problems.length > 0) {
    throw new InstallError(`package is invalid: ${problems.join("; ")}`);
  }
  if (trustedPublishers !== undefined && !trustedPublishers.includes(signed.publisherPublicKeyPem)) {
    throw new InstallError("package publisher is not trusted");
  }
}

// Verifies an already-resolved package and writes its files under the target directory.
// This is the half of installing that does not care where the package came from, so a
// local registry and a remote one share exactly the same trust and write path. Throws
// InstallError before touching the filesystem if verification fails.
export async function writeVerifiedPackage(
  signed: SignedPackage,
  options: InstallOptions,
): Promise<InstallResult> {
  verifyForInstall(signed, options.trustedPublishers);

  const { files } = signed.pkg;
  const written: string[] = [];
  for (const path of Object.keys(files).sort()) {
    if (!isSafePackagePath(path)) {
      throw new InstallError(`refusing to write unsafe path "${path}"`);
    }
    const target = join(options.dir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, files[path] ?? "", "utf8");
    written.push(path);
  }

  return {
    name: signed.pkg.meta.name,
    version: signed.pkg.meta.version,
    publisherPublicKeyPem: signed.publisherPublicKeyPem,
    files: written,
  };
}

// Resolves a specifier against a registry, verifies the package, and writes its files
// under the target directory. Throws InstallError if the specifier does not resolve.
export async function installPackage(
  registry: PackageRegistry,
  spec: string,
  options: InstallOptions,
): Promise<InstallResult> {
  const signed = registry.resolve(spec);
  if (signed === undefined) {
    throw new InstallError(`no package matches "${spec}"`);
  }
  return writeVerifiedPackage(signed, options);
}
