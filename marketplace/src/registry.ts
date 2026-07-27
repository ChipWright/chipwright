// The package registry. It holds signed packages keyed by name and version, and answers
// the questions a package manager asks: which versions of a name exist, which is latest,
// and which packages match a search. Publishing is guarded so the registry never stores
// a malformed package or one whose signature does not verify, which means anything an
// installer pulls back has already passed those checks once.
//
// The backing store is injectable so the same registry logic runs over an in-memory map
// in tests and a filesystem store from the command line, and could run over a network
// store later without changing this class.

import { packageConformance } from "./conformance.js";
import { validatePackage, type DevicePackage, type PackageMeta } from "./package.js";
import { verifySignedPackage, type SignedPackage } from "./signing.js";

// A stored entry is a signed package. The store persists these opaquely; the registry
// re-verifies on publish and installers re-verify on install.
export interface RegistryStore {
  get(name: string, version: string): SignedPackage | undefined;
  put(entry: SignedPackage): void;
  versions(name: string): string[];
  names(): string[];
}

export class InMemoryStore implements RegistryStore {
  private readonly entries = new Map<string, SignedPackage>();

  private key(name: string, version: string): string {
    return `${name}@${version}`;
  }

  get(name: string, version: string): SignedPackage | undefined {
    return this.entries.get(this.key(name, version));
  }

  put(entry: SignedPackage): void {
    this.entries.set(this.key(entry.pkg.meta.name, entry.pkg.meta.version), entry);
  }

  versions(name: string): string[] {
    const found: string[] = [];
    for (const entry of this.entries.values()) {
      if (entry.pkg.meta.name === name) {
        found.push(entry.pkg.meta.version);
      }
    }
    return found;
  }

  names(): string[] {
    const names = new Set<string>();
    for (const entry of this.entries.values()) {
      names.add(entry.pkg.meta.name);
    }
    return [...names];
  }
}

// Compares two three-part versions numerically. Returns a negative number when a is
// older than b, zero when equal, positive when a is newer.
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10));
  const pb = b.split(".").map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

export class PublishError extends Error {}

// Registry policy. When requireConformance is set, a package whose device is nonconformant
// to its class profile is rejected at publish. It is off by default so a registry accepts
// any well formed, correctly signed package unless it opts into the stricter gate.
export interface RegistryPolicy {
  requireConformance?: boolean;
}

export class PackageRegistry {
  private readonly policy: RegistryPolicy;

  constructor(
    private readonly store: RegistryStore,
    policy: RegistryPolicy = {},
  ) {
    this.policy = policy;
  }

  // Publishes a signed package after checking that it is well formed, that its signature
  // verifies, and that the same name and version has not already been published.
  // Republishing an existing version is rejected so a released version is immutable. When
  // the registry requires conformance, a nonconformant device is also rejected.
  publish(signed: SignedPackage): void {
    if (!verifySignedPackage(signed)) {
      throw new PublishError("signature does not verify");
    }
    const problems = validatePackage(signed.pkg);
    if (problems.length > 0) {
      throw new PublishError(`invalid package: ${problems.join("; ")}`);
    }
    const { name, version } = signed.pkg.meta;
    if (this.store.get(name, version) !== undefined) {
      throw new PublishError(`${name}@${version} is already published`);
    }
    if (this.policy.requireConformance === true) {
      const report = packageConformance(signed.pkg);
      if (report !== null && report.verdict === "nonconformant") {
        const reasons = report.diagnostics
          .filter((d) => d.severity === "error")
          .map((d) => d.message)
          .join("; ");
        throw new PublishError(
          `device is nonconformant to its ${report.class} class${reasons.length > 0 ? `: ${reasons}` : ""}`,
        );
      }
    }
    this.store.put(signed);
  }

  versions(name: string): string[] {
    return this.store.versions(name).sort(compareVersions);
  }

  // The highest published version of a name, or undefined if the name is unknown.
  latest(name: string): string | undefined {
    const versions = this.versions(name);
    return versions.length > 0 ? versions[versions.length - 1] : undefined;
  }

  get(name: string, version: string): SignedPackage | undefined {
    return this.store.get(name, version);
  }

  // Resolves a package specifier of the form "name" or "name@version" to a stored entry.
  // A bare name resolves to the latest version.
  resolve(spec: string): SignedPackage | undefined {
    const at = spec.lastIndexOf("@");
    if (at > 0) {
      const name = spec.slice(0, at);
      const version = spec.slice(at + 1);
      return this.store.get(name, version);
    }
    const latest = this.latest(spec);
    return latest === undefined ? undefined : this.store.get(spec, latest);
  }

  // Returns the latest metadata of every package whose name, description, category, or
  // keywords contain the query, ordered by name. An empty query lists everything.
  search(query: string): PackageMeta[] {
    const needle = query.trim().toLowerCase();
    const results: PackageMeta[] = [];
    for (const name of this.store.names().sort()) {
      const latest = this.latest(name);
      if (latest === undefined) {
        continue;
      }
      const meta = this.store.get(name, latest)?.pkg.meta;
      if (meta === undefined) {
        continue;
      }
      if (needle.length === 0 || matches(meta, needle)) {
        results.push(meta);
      }
    }
    return results;
  }
}

function matches(meta: PackageMeta, needle: string): boolean {
  const haystack = [meta.name, meta.description, meta.category, ...meta.keywords]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export type { DevicePackage };
