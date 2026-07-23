// Runs generator backends over an IR and writes the resulting files to disk.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DeviceIR } from "./schema.js";
import { defaultGenerators, type GeneratedFile, type Generator } from "./generators/index.js";

export function compile(ir: DeviceIR, generators: Generator[] = defaultGenerators): GeneratedFile[] {
  return generators.flatMap((generator) => generator.generate(ir));
}

export async function writeArtifacts(files: GeneratedFile[], outDir: string): Promise<string[]> {
  const written: string[] = [];
  for (const file of files) {
    const target = join(outDir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.contents, "utf8");
    written.push(target);
  }
  return written;
}
