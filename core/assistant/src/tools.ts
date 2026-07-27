// The agent's tools, each grounded in the real platform. Reading, validating, and
// compiling a manifest all go through @chipwright/studio-core, so the assistant checks its
// work against the actual DDL compiler rather than asserting it. The propose_device tool is
// the human-in-the-loop gate: it refuses to record a proposal unless the manifest compiles,
// which makes "grounded" an enforced invariant, not merely something the prompt requests.

import { validate, generate, DEVICE_TEMPLATES, formToManifest } from "@chipwright/studio-core";
import type { ToolSchema } from "./types.js";

// A change the assistant proposes to a device manifest. It is only ever created by
// propose_device, and only for a manifest that compiles.
export interface DeviceProposal {
  summary: string;
  yaml: string;
  deviceName: string | null;
  files: string[];
}

export interface ToolContext {
  // Collected proposals; a surface (CLI, IDE) shows these for the developer to apply.
  proposals: DeviceProposal[];
  // Reads a file's text. Injectable so tests need no real filesystem.
  readFile: (path: string) => Promise<string>;
}

// A tool over a context C. The context defaults to ToolContext (the device assistant), so
// existing device tools need no type argument; the BSP assistant supplies its own context.
export interface Tool<C = ToolContext> {
  schema: ToolSchema;
  handler: (args: Record<string, unknown>, context: C) => Promise<string>;
}

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

const readDevice: Tool = {
  schema: {
    name: "read_device",
    description: "Read a device manifest (device.yaml) from disk and return its contents.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Path to the manifest file." } },
      required: ["path"],
    },
  },
  handler: async (args, context) => {
    const path = str(args, "path");
    if (path.length === 0) {
      return "error: path is required";
    }
    try {
      return await context.readFile(path);
    } catch (error) {
      return `error: could not read ${path}: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

const validateManifest: Tool = {
  schema: {
    name: "validate_manifest",
    description: "Validate manifest YAML against the DDL and return diagnostics.",
    parameters: {
      type: "object",
      properties: { yaml: { type: "string", description: "The full manifest YAML to validate." } },
      required: ["yaml"],
    },
  },
  handler: (args) => {
    const result = validate(str(args, "yaml"));
    return Promise.resolve(
      JSON.stringify({ valid: result.valid, deviceName: result.deviceName, diagnostics: result.diagnostics }),
    );
  },
};

const compileManifest: Tool = {
  schema: {
    name: "compile_manifest",
    description: "Compile manifest YAML and report validity plus the artifacts it generates.",
    parameters: {
      type: "object",
      properties: { yaml: { type: "string", description: "The full manifest YAML to compile." } },
      required: ["yaml"],
    },
  },
  handler: (args) => {
    const result = generate(str(args, "yaml"));
    return Promise.resolve(
      JSON.stringify({
        valid: result.valid,
        diagnostics: result.diagnostics,
        files: result.files.map((f) => f.path),
      }),
    );
  },
};

const listTemplates: Tool = {
  schema: {
    name: "list_templates",
    description: "List the built-in device templates and their manifests as starting points.",
    parameters: { type: "object", properties: {} },
  },
  handler: () =>
    Promise.resolve(
      JSON.stringify(
        DEVICE_TEMPLATES.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          yaml: formToManifest(t.form),
        })),
      ),
    ),
};

const proposeDevice: Tool = {
  schema: {
    name: "propose_device",
    description:
      "Propose a device manifest as the result. Rejected unless it compiles, so only a valid manifest can be proposed. Call this once the manifest is ready.",
    parameters: {
      type: "object",
      properties: {
        yaml: { type: "string", description: "The complete proposed manifest YAML." },
        summary: { type: "string", description: "A short description of what changed and why." },
      },
      required: ["yaml", "summary"],
    },
  },
  handler: (args, context) => {
    const yaml = str(args, "yaml");
    const result = generate(yaml);
    if (!result.valid) {
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      return Promise.resolve(
        `rejected: the manifest does not compile. Fix these and call propose_device again: ${JSON.stringify(errors)}`,
      );
    }
    const validation = validate(yaml);
    context.proposals.push({
      summary: str(args, "summary"),
      yaml,
      deviceName: validation.deviceName,
      files: result.files.map((f) => f.path),
    });
    return Promise.resolve(
      `accepted: "${validation.deviceName ?? "device"}" compiles and generates ${result.files.length} artifact(s).`,
    );
  },
};

// The default toolset for the diagnose-and-author assistant.
export function defaultTools(): Tool[] {
  return [readDevice, validateManifest, compileManifest, listTemplates, proposeDevice];
}
