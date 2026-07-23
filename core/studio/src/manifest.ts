// Manifest surface for the IDE. Wraps the device engine so the shell (VS Code extension
// today, a standalone app later) only ever calls plain functions: validate a manifest to
// diagnostics, or generate every downstream artifact from it. All device-engine coupling
// lives here so the shell never imports the compiler directly.

import {
  compile,
  parseManifest,
  type Diagnostic,
  type GeneratedFile,
} from "@openhome/device-engine";

export interface ValidationResult {
  valid: boolean;
  deviceName: string | null;
  diagnostics: Diagnostic[];
}

export interface GenerationResult {
  valid: boolean;
  diagnostics: Diagnostic[];
  files: GeneratedFile[];
}

// Validates manifest YAML and reports diagnostics. A manifest is valid when it produced an
// IR (no errors); warnings do not make it invalid.
export function validate(manifestYaml: string): ValidationResult {
  const { ir, diagnostics } = parseManifest(manifestYaml);
  return {
    valid: ir !== null,
    deviceName: ir?.device.name ?? null,
    diagnostics,
  };
}

// Generates every downstream artifact from manifest YAML. When the manifest is invalid no
// files are produced, so the caller can surface diagnostics without a partial generation.
export function generate(manifestYaml: string): GenerationResult {
  const { ir, diagnostics } = parseManifest(manifestYaml);
  if (ir === null) {
    return { valid: false, diagnostics, files: [] };
  }
  return { valid: true, diagnostics, files: compile(ir) };
}
