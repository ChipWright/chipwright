// Builds the digital-twin binary and places it in the extension's media directory so it can be
// bundled in the .vsix and run with no toolchain and no source workspace. The output path uses
// the VS Code platform-target naming (<platform>-<arch>, e.g. darwin-arm64, linux-x64), so the
// extension resolves the right binary at runtime and platform-specific packages carry only theirs.
// Run from the repository (needs the twin, simulator, and SDK C sources). On macOS pass
// --arch x64 to cross-build the Intel binary alongside the native arm64 one.

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..", "..");
const ideMedia = resolve(scriptDir, "..", "media");

const archArg = process.argv.indexOf("--arch");
const arch = archArg !== -1 ? process.argv[archArg + 1] : process.arch; // "x64" | "arm64"
const platform = process.platform; // "darwin" | "linux" | "win32"
const target = `${platform}-${arch}`;

const sources = [
  "simulator/examples/twin_studio/main.c",
  "simulator/src/source.c",
  "simulator/src/fault.c",
  "sdk/firmware/src/hal.c",
  "sdk/firmware/src/sdk.c",
  "sdk/firmware/src/log.c",
].map((p) => join(repoRoot, p));

const includes = ["sdk/firmware/include", "protocols/include", "simulator/include"].flatMap((p) => [
  "-I",
  join(repoRoot, p),
]);

const outDir = join(ideMedia, "twin", target);
const outName = platform === "win32" ? "twin_studio.exe" : "twin_studio";
const outPath = join(outDir, outName);
mkdirSync(outDir, { recursive: true });

const cc = process.env["CC"] ?? "cc";
const flags = ["-std=c11", "-O2", "-Wall", "-Wextra"];
// macOS can cross-build either architecture; the cc token for Intel is x86_64.
if (platform === "darwin") {
  flags.push("-arch", arch === "x64" ? "x86_64" : "arm64");
}

execFileSync(cc, [...flags, ...includes, ...sources, "-o", outPath], { stdio: "inherit" });
console.log(`built twin -> media/twin/${target}/${outName}`);
