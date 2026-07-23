// A filesystem-backed registry store, used by the command line so published packages
// persist between invocations. Each signed package is one JSON file at
// <root>/<name>/<version>.json. The store is deliberately synchronous to satisfy the
// RegistryStore contract; a local registry directory is small and a CLI blocks on it
// anyway, so the simplicity is worth more than concurrency here.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type RegistryStore } from "./registry.js";
import { type SignedPackage } from "./signing.js";

export class FileSystemStore implements RegistryStore {
  constructor(private readonly root: string) {
    mkdirSync(this.root, { recursive: true });
  }

  private nameDir(name: string): string {
    return join(this.root, name);
  }

  private entryPath(name: string, version: string): string {
    return join(this.nameDir(name), `${version}.json`);
  }

  get(name: string, version: string): SignedPackage | undefined {
    const path = this.entryPath(name, version);
    if (!existsSync(path)) {
      return undefined;
    }
    return JSON.parse(readFileSync(path, "utf8")) as SignedPackage;
  }

  put(entry: SignedPackage): void {
    const { name, version } = entry.pkg.meta;
    mkdirSync(this.nameDir(name), { recursive: true });
    writeFileSync(this.entryPath(name, version), JSON.stringify(entry, null, 2), "utf8");
  }

  versions(name: string): string[] {
    const dir = this.nameDir(name);
    if (!existsSync(dir)) {
      return [];
    }
    return readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -".json".length));
  }

  names(): string[] {
    if (!existsSync(this.root)) {
      return [];
    }
    return readdirSync(this.root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  }
}
