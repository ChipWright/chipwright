// The grounding for BSP drafting: a host compile check. A board support package is real
// only if it type-checks against the actual HAL interface, so a drafted BSP is written to a
// temporary directory and compiled with the system C compiler against sdk/firmware/include
// and the draft's own vendor stubs, exactly as the checked-in esp32 BSP host check does
// (see sdk/firmware/bsp/esp32/Makefile). No object is kept; this only proves it compiles.

import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// sdk/firmware resolved relative to this module, whether run from src (tsx) or dist (built);
// both live two directories under the package root, three under the repo root.
const DEFAULT_SDK_FIRMWARE = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../sdk/firmware",
);

export interface BspFile {
  // Forward-slash path relative to the BSP directory, e.g. "stm32_bsp.c" or
  // "hostcheck/driver/adc.h". Vendor headers the board needs go under hostcheck/.
  path: string;
  content: string;
}

export interface BspCompileOptions {
  sdkFirmwareDir?: string;
  cc?: string;
}

export interface BspCompileResult {
  ok: boolean;
  output: string;
}

function isSafeRelativePath(path: string): boolean {
  if (path.length === 0 || path.startsWith("/") || path.includes("\\") || /^[a-zA-Z]:/.test(path)) {
    return false;
  }
  return path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

// Writes the draft to a temp dir and compiles every .c file against the HAL headers and the
// draft's hostcheck stubs. Uses the same flags as the esp32 host check, including -Werror, so
// the bar for "compiles" matches the repository's own BSP standard. Cleans up the temp dir.
export async function compileBsp(
  files: readonly BspFile[],
  options: BspCompileOptions = {},
): Promise<BspCompileResult> {
  const sources = files.filter((f) => f.path.endsWith(".c"));
  if (sources.length === 0) {
    return { ok: false, output: "no .c source file provided" };
  }
  for (const file of files) {
    if (!isSafeRelativePath(file.path)) {
      return { ok: false, output: `unsafe file path "${file.path}"` };
    }
  }

  const sdkInclude = join(options.sdkFirmwareDir ?? DEFAULT_SDK_FIRMWARE, "include");
  const cc = options.cc ?? process.env["CC"] ?? "cc";
  const dir = mkdtempSync(join(tmpdir(), "openhome-bsp-"));
  try {
    for (const file of files) {
      const full = join(dir, file.path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, file.content, "utf8");
    }
    const flags = [
      "-std=c11",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-I",
      sdkInclude,
      "-I",
      join(dir, "hostcheck"),
      "-I",
      dir,
    ];
    const messages: string[] = [];
    let ok = true;
    for (const source of sources) {
      try {
        await execFileAsync(cc, [...flags, "-c", join(dir, source.path), "-o", join(dir, "out.o")]);
      } catch (error) {
        ok = false;
        const stderr = (error as { stderr?: string }).stderr ?? String(error);
        messages.push(`# ${source.path}\n${stderr.trim()}`);
      }
    }
    return { ok, output: ok ? "compiled cleanly" : messages.join("\n\n") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
