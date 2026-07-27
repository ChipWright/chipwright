// AI-assisted BSP drafting. A board support package maps the Chipwright HAL capability traits
// to a chip's drivers; contributing one is how the community adds hardware. These tools help
// draft a BSP for a new board and, crucially, ground the draft: read the exact HAL interface
// and a reference BSP, and compile the draft against the real headers before it is surfaced.
// propose_bsp is the human-in-the-loop gate and refuses any draft that does not compile, so a
// broken BSP can never reach the contributor as a suggestion, mirroring propose_device.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { compileBsp, type BspFile } from "./bsp-compile.js";
import type { Tool } from "./tools.js";
import type { ToolSchema } from "./types.js";

// A drafted board support package: one or more source and header files, plus any vendor
// header stubs under hostcheck/ needed for the host compile check.
export interface BspProposal {
  board: string;
  summary: string;
  files: BspFile[];
}

export interface BspToolContext {
  proposals: BspProposal[];
  // The repository's sdk/firmware directory, used to read the HAL interface and reference
  // BSPs and as the include root for the compile check. Injectable so tests are hermetic.
  sdkFirmwareDir: string;
}

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value : "";
}

// Coerces the model's files argument (an array of {path, content}) into BspFile[].
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
    "The BSP files. Each is { path, content }. Paths are relative, e.g. \"stm32_bsp.c\", \"stm32_bsp.h\", and any vendor header stubs under \"hostcheck/\".",
  items: {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
  },
};

const readHalInterface: Tool<BspToolContext> = {
  schema: {
    name: "read_hal_interface",
    description:
      "Read the Chipwright HAL and SDK headers a BSP must implement (hal.h and sdk.h). Read this first.",
    parameters: { type: "object", properties: {} },
  },
  handler: async (_args, context) => {
    const dir = join(context.sdkFirmwareDir, "include", "chipwright");
    const [sdk, hal] = await Promise.all([
      readFile(join(dir, "sdk.h"), "utf8"),
      readFile(join(dir, "hal.h"), "utf8"),
    ]);
    return `// sdk.h\n${sdk}\n// hal.h\n${hal}`;
  },
};

const readReferenceBsp: Tool<BspToolContext> = {
  schema: {
    name: "read_reference_bsp",
    description:
      "Read a reference BSP as a worked example. name is \"native\" (portable, simplest) or \"esp32\" (shows vendor headers stubbed under hostcheck/).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "\"native\" or \"esp32\"" },
      },
      required: ["name"],
    },
  },
  handler: async (args, context) => {
    const name = str(args, "name");
    try {
      if (name === "esp32") {
        const base = join(context.sdkFirmwareDir, "bsp", "esp32");
        const [header, source, stub] = await Promise.all([
          readFile(join(base, "esp32_bsp.h"), "utf8"),
          readFile(join(base, "esp32_bsp.c"), "utf8"),
          readFile(join(base, "hostcheck", "driver", "temperature_sensor.h"), "utf8"),
        ]);
        return `// esp32_bsp.h\n${header}\n// esp32_bsp.c\n${source}\n// hostcheck/driver/temperature_sensor.h (a vendor stub)\n${stub}`;
      }
      const base = join(context.sdkFirmwareDir, "bsp", "native");
      const [header, source] = await Promise.all([
        readFile(join(base, "native_bsp.h"), "utf8"),
        readFile(join(base, "native_bsp.c"), "utf8"),
      ]);
      return `// native_bsp.h\n${header}\n// native_bsp.c\n${source}`;
    } catch (error) {
      return `error: could not read reference BSP "${name}": ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

const compileBspTool: Tool<BspToolContext> = {
  schema: {
    name: "compile_bsp",
    description:
      "Compile a draft BSP against the real HAL headers (host compile check, same flags as the repo, including -Werror). Use it to check your work before proposing.",
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
    const result = await compileBsp(files, { sdkFirmwareDir: context.sdkFirmwareDir });
    return JSON.stringify(result);
  },
};

const proposeBsp: Tool<BspToolContext> = {
  schema: {
    name: "propose_bsp",
    description:
      "Propose the BSP as the result. Rejected unless it compiles against the HAL, so only a working BSP can be proposed. Call this once it is ready.",
    parameters: {
      type: "object",
      properties: {
        board: { type: "string", description: "The board or chip name, e.g. \"stm32\"." },
        summary: { type: "string", description: "A short description of what the BSP provides." },
        files: filesSchema,
      },
      required: ["board", "summary", "files"],
    },
  },
  handler: async (args, context) => {
    const files = parseFiles(args["files"]);
    if (files === null) {
      return "error: files must be an array of { path, content }";
    }
    const result = await compileBsp(files, { sdkFirmwareDir: context.sdkFirmwareDir });
    if (!result.ok) {
      return `rejected: the BSP does not compile. Fix these and call propose_bsp again:\n${result.output}`;
    }
    context.proposals.push({ board: str(args, "board"), summary: str(args, "summary"), files });
    return `accepted: the ${str(args, "board")} BSP compiles cleanly against the HAL (${files.length} file(s)).`;
  },
};

export const BSP_SYSTEM_PROMPT = `You are the Chipwright hardware enablement assistant. You help a contributor draft a board support package (BSP) that brings a new chip or board to the Chipwright firmware SDK.

A BSP implements the HAL: it registers sensor and actuator drivers with cw_hal_register_sensor / cw_hal_register_actuator, backed by the chip's peripherals, and exposes a single cw_<board>_bsp_register(void) entry point. Nothing above the HAL knows the chip.

Rules:
- Ground everything in the tools. Call read_hal_interface first to see the exact functions and types to implement, and read_reference_bsp to model your work on an existing BSP.
- A BSP that references vendor SDK headers must ship minimal stub headers under hostcheck/ so it type-checks on the host without the vendor toolchain, exactly as the esp32 BSP does.
- Draft the files, then call compile_bsp and fix any errors. The check uses -Werror, so warnings are failures.
- Finalize with propose_bsp, which only accepts a BSP that compiles. Do not claim a BSP works without compiling it.
- Be concise and specific.`;

// The toolset for the BSP drafting assistant.
export function bspTools(): Tool<BspToolContext>[] {
  return [readHalInterface, readReferenceBsp, compileBspTool, proposeBsp];
}
