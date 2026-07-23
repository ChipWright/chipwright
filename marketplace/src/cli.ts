#!/usr/bin/env node
// The marketplace command line: the realization of "openhome install <device>". It wires
// the pack, sign, publish, resolve, and install flows over a filesystem-backed registry
// so a developer can share and pull device packages from the terminal. Everything it does
// is available as a library from index.ts; this file is only argument parsing and output.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Publisher, type PublisherKeys } from "./signing.js";
import { PackageRegistry, PublishError } from "./registry.js";
import { FileSystemStore } from "./store.js";
import { packDirectory, PackError } from "./pack.js";
import { installPackage, InstallError } from "./install.js";

interface Args {
  command: string;
  positionals: string[];
  flags: Map<string, string>;
}

function parseArgs(argv: string[]): Args {
  const positionals: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] ?? "";
    if (token.startsWith("--")) {
      const name = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(name, next);
        i++;
      } else {
        flags.set(name, "true");
      }
    } else {
      positionals.push(token);
    }
  }
  return { command: positionals[0] ?? "help", positionals: positionals.slice(1), flags };
}

function registryHome(flags: Map<string, string>): string {
  return flags.get("registry") ?? process.env["OPENHOME_REGISTRY"] ?? join(homedir(), ".openhome");
}

function openRegistry(flags: Map<string, string>): PackageRegistry {
  return new PackageRegistry(new FileSystemStore(join(registryHome(flags), "registry")));
}

// Loads the publisher identity for this registry home, creating and saving a new one on
// first use so a developer has a stable publisher key without any setup step.
function loadPublisher(flags: Map<string, string>): Publisher {
  const home = registryHome(flags);
  mkdirSync(home, { recursive: true });
  const keyPath = join(home, "publisher.key.json");
  if (existsSync(keyPath)) {
    const keys = JSON.parse(readFileSync(keyPath, "utf8")) as PublisherKeys;
    return new Publisher(keys);
  }
  const publisher = new Publisher();
  writeFileSync(keyPath, JSON.stringify(publisher.exportKeys(), null, 2), "utf8");
  return publisher;
}

// A short, publisher-distinguishing identifier: the first bytes of the SHA-256 of the
// public key. Hashing is necessary because Ed25519 SPKI keys share a constant prefix, so
// the raw key bytes do not distinguish publishers at a glance.
function fingerprint(publicKeyPem: string): string {
  return createHash("sha256").update(publicKeyPem).digest("hex").slice(0, 16);
}

const USAGE = `openhome - device package manager

Usage:
  openhome publish [dir]        Pack, sign, and publish the project in dir (default .)
  openhome install <spec> [--dir target]
                               Install name or name@version into target (default .)
  openhome search [query]      List packages matching query (all if omitted)
  openhome info <spec>         Show a package's metadata, versions, and files
  openhome list                List every published package and its latest version

Options:
  --registry <dir>             Registry home (default $OPENHOME_REGISTRY or ~/.openhome)
`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  switch (args.command) {
    case "publish": {
      const dir = args.positionals[0] ?? ".";
      const pkg = await packDirectory(dir);
      const publisher = loadPublisher(args.flags);
      const signed = publisher.sign(pkg);
      openRegistry(args.flags).publish(signed);
      console.log(`published ${pkg.meta.name}@${pkg.meta.version}`);
      console.log(`publisher ${fingerprint(publisher.publicKeyPem)}`);
      return 0;
    }
    case "install": {
      const spec = args.positionals[0];
      if (spec === undefined) {
        console.error("install requires a package specifier");
        return 1;
      }
      const dir = args.flags.get("dir") ?? ".";
      const result = await installPackage(openRegistry(args.flags), spec, { dir });
      console.log(`installed ${result.name}@${result.version} into ${dir}`);
      console.log(`  signed by ${fingerprint(result.publisherPublicKeyPem)}`);
      for (const file of result.files) {
        console.log(`  ${file}`);
      }
      return 0;
    }
    case "search": {
      const results = openRegistry(args.flags).search(args.positionals[0] ?? "");
      if (results.length === 0) {
        console.log("no packages found");
        return 0;
      }
      for (const meta of results) {
        console.log(`${meta.name}@${meta.version}  ${meta.description}`);
      }
      return 0;
    }
    case "info": {
      const spec = args.positionals[0];
      if (spec === undefined) {
        console.error("info requires a package specifier");
        return 1;
      }
      const registry = openRegistry(args.flags);
      const signed = registry.resolve(spec);
      if (signed === undefined) {
        console.error(`no package matches "${spec}"`);
        return 1;
      }
      const { meta } = signed.pkg;
      console.log(`${meta.name}@${meta.version}`);
      console.log(`  ${meta.description}`);
      console.log(`  category: ${meta.category}`);
      console.log(`  license:  ${meta.license}`);
      console.log(`  versions: ${registry.versions(meta.name).join(", ")}`);
      console.log(`  signed by ${fingerprint(signed.publisherPublicKeyPem)}`);
      console.log(`  files:`);
      for (const file of Object.keys(signed.pkg.files).sort()) {
        console.log(`    ${file}`);
      }
      return 0;
    }
    case "list": {
      const registry = openRegistry(args.flags);
      const results = registry.search("");
      if (results.length === 0) {
        console.log("registry is empty");
        return 0;
      }
      for (const meta of results) {
        console.log(`${meta.name}  ${meta.version}`);
      }
      return 0;
    }
    default:
      console.log(USAGE);
      return args.command === "help" ? 0 : 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    if (error instanceof PackError || error instanceof PublishError || error instanceof InstallError) {
      console.error(error.message);
    } else {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    }
    process.exit(1);
  });
