// AI-assisted firmware behavior. Where the ask tools evolve the DDL and the bsp tools bring up
// a chip, these tools help a developer write the device logic that sits on the generated
// interface: implement the capability prototypes, add control behavior, wire it to the SDK. The
// grounding is a real compile against this device's generated interface and the SDK headers, so
// propose_firmware (the human-in-the-loop gate) refuses any code that does not build. A model
// cannot surface firmware that would not compile, exactly as propose_device and propose_bsp.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generate, scaffold } from "@chipwright/studio-core";
import { compileBsp, type BspCompileResult, type BspFile } from "./bsp-compile.js";
import type { Tool } from "./tools.js";

// A drafted firmware change: one or more source and header files the developer would add or
// replace under their device's firmware directory.
export interface FirmwareProposal {
  summary: string;
  files: BspFile[];
}

export interface FirmwareToolContext {
  proposals: FirmwareProposal[];
  // The repository's sdk/firmware directory: the include root for the compile check and the
  // source of the HAL headers and reference firmware. Injectable so tests are hermetic.
  sdkFirmwareDir: string;
  // The device manifest the developer is working on. Its generated interface is what the
  // firmware must implement, so it is the ground truth for every tool here.
  manifestYaml: string;
}

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

function parseFiles(value: unknown): BspFile[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const files: BspFile[] = [];
  for (const entry of value) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { path?: unknown }).path !== "string" ||
      typeof (entry as { content?: unknown }).content !== "string"
    ) {
      return null;
    }
    files.push({ path: (entry as BspFile).path, content: (entry as BspFile).content });
  }
  return files;
}

const filesSchema = {
  type: "array",
  description:
    'The firmware files. Each is { path, content }. Paths are relative, e.g. "smart_thermostat.c" or a header. Do not include the generated interface header; it is provided by the compile.',
  items: {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
  },
};

// The generated interface header for the current device, as a file at its bare name so an
// #include of the basename resolves during the compile check. Null when the manifest itself
// does not compile, which the caller reports rather than compiling against nothing.
function interfaceHeader(manifestYaml: string): BspFile | null {
  const generation = generate(manifestYaml);
  if (!generation.valid) {
    return null;
  }
  const header = generation.files.find((file) => file.path.endsWith("_interface.h"));
  if (header === undefined) {
    return null;
  }
  const name = header.path.split("/").pop() ?? header.path;
  return { path: name, content: header.contents };
}

// Compiles firmware against this device's generated interface and the SDK HAL headers, using
// the same host compile check as the BSP tools (same flags, including -Werror). The generated
// interface is injected so the developer's code is checked against the exact prototypes it must
// implement; any file the model supplies under the interface's name is dropped so the generated
// header stays authoritative.
async function compileFirmware(
  manifestYaml: string,
  files: readonly BspFile[],
  sdkFirmwareDir: string,
): Promise<BspCompileResult> {
  const header = interfaceHeader(manifestYaml);
  if (header === null) {
    return { ok: false, output: "the device manifest does not compile; fix the device definition first" };
  }
  const authored = files.filter((file) => file.path !== header.path);
  return compileBsp([header, ...authored], { sdkFirmwareDir });
}

const readDeviceInterface: Tool<FirmwareToolContext> = {
  schema: {
    name: "read_device_interface",
    description:
      "Read the generated firmware interface for the current device: the exact capability prototypes (oh_<key>_read, oh_<key>_set_mode) the firmware must implement. Read this first.",
    parameters: { type: "object", properties: {} },
  },
  handler: async (_args, context) => {
    const header = interfaceHeader(context.manifestYaml);
    if (header === null) {
      return "error: the device manifest does not compile, so no interface was generated. Fix the device definition first.";
    }
    return `// ${header.path} (generated from the device manifest; do not edit)\n${header.content}`;
  },
};

const readHalInterface: Tool<FirmwareToolContext> = {
  schema: {
    name: "read_hal_interface",
    description:
      "Read the OpenHome SDK and HAL headers the firmware calls (sdk.h and hal.h): status codes, the device lifecycle (oh_device_init, oh_device_run), telemetry, and the HAL sensor/actuator functions.",
    parameters: { type: "object", properties: {} },
  },
  handler: async (_args, context) => {
    const dir = join(context.sdkFirmwareDir, "include", "openhome");
    const [sdk, hal] = await Promise.all([
      readFile(join(dir, "sdk.h"), "utf8"),
      readFile(join(dir, "hal.h"), "utf8"),
    ]);
    return `// sdk.h\n${sdk}\n// hal.h\n${hal}`;
  },
};

const readReferenceFirmware: Tool<FirmwareToolContext> = {
  schema: {
    name: "read_reference_firmware",
    description:
      "Read a worked example: the starter firmware scaffolded for this exact device (it already implements every prototype by delegating to the HAL and registers a driver per capability). Model your changes on it.",
    parameters: { type: "object", properties: {} },
  },
  handler: async (_args, context) => {
    const result = scaffold(context.manifestYaml);
    if (!result.valid) {
      return "error: the device manifest does not compile, so no reference firmware could be scaffolded.";
    }
    return result.files.map((file) => `// ${file.path}\n${file.contents}`).join("\n\n");
  },
};

const compileFirmwareTool: Tool<FirmwareToolContext> = {
  schema: {
    name: "compile_firmware",
    description:
      "Compile firmware against this device's generated interface and the SDK headers (host compile check, same flags as the repo, including -Werror). Use it to check your work before proposing.",
    parameters: {
      type: "object",
      properties: { files: filesSchema },
      required: ["files"],
    },
  },
  handler: async (args, context) => {
    const files = parseFiles(args["files"]);
    if (files === null) {
      return "error: files must be an array of { path, content }";
    }
    const result = await compileFirmware(context.manifestYaml, files, context.sdkFirmwareDir);
    return JSON.stringify(result);
  },
};

const proposeFirmware: Tool<FirmwareToolContext> = {
  schema: {
    name: "propose_firmware",
    description:
      "Propose the firmware as the result. Rejected unless it compiles against this device's interface and the SDK, so only working firmware can be proposed. Call this once it is ready.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "A short description of what the firmware does." },
        files: filesSchema,
      },
      required: ["summary", "files"],
    },
  },
  handler: async (args, context) => {
    const files = parseFiles(args["files"]);
    if (files === null) {
      return "error: files must be an array of { path, content }";
    }
    const result = await compileFirmware(context.manifestYaml, files, context.sdkFirmwareDir);
    if (!result.ok) {
      return `rejected: the firmware does not compile. Fix these and call propose_firmware again:\n${result.output}`;
    }
    context.proposals.push({ summary: str(args, "summary"), files });
    return `accepted: the firmware compiles cleanly against the device interface and the SDK (${files.length} file(s)).`;
  },
};

export const FIRMWARE_SYSTEM_PROMPT = `You are the OpenHome firmware assistant. You help a developer write the device logic that runs on top of a device's generated interface.

The device definition (DDL) is compiled into a firmware interface header that declares one prototype per capability: a sensor is oh_<key>_read(float *out_value), an actuator is oh_<key>_set_mode(oh_<key>_mode_t mode). Firmware implements those prototypes and the device lifecycle from the SDK (oh_device_init, oh_device_run), calling the HAL (oh_hal_*) to reach the hardware through a board support package. Nothing above the HAL names a register.

Rules:
- Ground everything in the tools. Call read_device_interface first to see the exact prototypes to implement, read_hal_interface for the SDK and HAL surface, and read_reference_firmware for a worked starter for this device.
- Do not author or edit the generated interface header; implement against it. The compile provides it for you.
- Write the firmware, then call compile_firmware and fix any errors. The check uses -Werror, so warnings are failures.
- Finalize with propose_firmware, which only accepts firmware that compiles. Do not claim firmware works without compiling it.
- Be concise and specific.`;

// The toolset for the firmware behavior assistant.
export function firmwareTools(): Tool<FirmwareToolContext>[] {
  return [readDeviceInterface, readHalInterface, readReferenceFirmware, compileFirmwareTool, proposeFirmware];
}
