// Loads a manifest from YAML text or a file and turns it into a validated IR.

import { readFile } from "node:fs/promises";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { hasErrors, type ParseResult } from "./schema.js";
import { validateManifest } from "./validate.js";

export function parseManifest(source: string): ParseResult {
  let root: unknown;
  try {
    root = parseYaml(source);
  } catch (cause) {
    const message = cause instanceof YAMLParseError ? cause.message : String(cause);
    return {
      ir: null,
      diagnostics: [{ severity: "error", path: "", message: `invalid YAML: ${message}` }],
    };
  }

  const { ir, diagnostics } = validateManifest(root);
  return { ir: hasErrors(diagnostics) ? null : ir, diagnostics };
}

export async function loadManifestFile(path: string): Promise<ParseResult> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return {
      ir: null,
      diagnostics: [{ severity: "error", path, message: `cannot read manifest: ${message}` }],
    };
  }
  return parseManifest(source);
}
