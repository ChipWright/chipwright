// Bundles the extension and its studio-core dependency into a single CommonJS file for the
// VS Code extension host. The vscode module is provided by the host at runtime and must
// stay external; Node builtins are left external by the node platform target.

import { build } from "esbuild";

await build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  format: "cjs",
  platform: "node",
  target: "node22",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
});
