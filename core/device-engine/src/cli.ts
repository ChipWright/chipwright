// Command-line entry point for the device engine.
//
//   openhome validate <manifest>
//   openhome compile  <manifest> --out <dir>

import { compile, writeArtifacts } from "./compile.js";
import { loadManifestFile } from "./parse.js";
import type { Diagnostic } from "./schema.js";

const USAGE = `openhome - OpenHome Studio device engine

Usage:
  openhome validate <manifest>
  openhome compile  <manifest> --out <dir>
`;

function printDiagnostics(diagnostics: readonly Diagnostic[]): void {
  for (const d of diagnostics) {
    const location = d.path.length > 0 ? d.path : "<manifest>";
    process.stderr.write(`  ${d.severity}: ${location}: ${d.message}\n`);
  }
}

function parseOption(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }
  return args[index + 1] ?? null;
}

async function runValidate(manifest: string | undefined): Promise<number> {
  if (manifest === undefined) {
    process.stderr.write(USAGE);
    return 2;
  }
  const { ir, diagnostics } = await loadManifestFile(manifest);
  printDiagnostics(diagnostics);
  if (ir === null) {
    process.stderr.write("manifest is invalid\n");
    return 1;
  }
  process.stdout.write(`manifest is valid: ${ir.device.name}\n`);
  return 0;
}

async function runCompile(manifest: string | undefined, outDir: string | null): Promise<number> {
  if (manifest === undefined || outDir === null) {
    process.stderr.write(USAGE);
    return 2;
  }
  const { ir, diagnostics } = await loadManifestFile(manifest);
  printDiagnostics(diagnostics);
  if (ir === null) {
    process.stderr.write("manifest is invalid; nothing generated\n");
    return 1;
  }
  const files = compile(ir);
  const written = await writeArtifacts(files, outDir);
  for (const path of written) {
    process.stdout.write(`generated ${path}\n`);
  }
  process.stdout.write(`compiled ${ir.device.name}: ${written.length} file(s)\n`);
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case "validate":
      return runValidate(rest[0]);
    case "compile":
      return runCompile(rest[0], parseOption(rest, "--out"));
    case "help":
    case undefined:
      process.stdout.write(USAGE);
      return 0;
    default:
      process.stderr.write(`unknown command: ${command}\n`);
      process.stderr.write(USAGE);
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`error: ${message}\n`);
    process.exitCode = 1;
  },
);
