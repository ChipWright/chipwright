// Bundles the extension and its studio-core dependency into a single CommonJS file for the
// VS Code extension host. The vscode module is provided by the host at runtime and must
// stay external; Node builtins are left external by the node platform target.

import { build } from "esbuild";

// Bundled dependencies (the assistant core) use import.meta.url to resolve paths relative to
// their own file. A CommonJS bundle has no import.meta, so map it to the bundle's own file URL
// derived from __filename; without this it is empty and new URL(".", undefined) throws at load,
// crashing extension activation.
await build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  format: "cjs",
  platform: "node",
  target: "node20",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
  banner: { js: "var importMetaUrl = require('url').pathToFileURL(__filename).href;" },
  define: { "import.meta.url": "importMetaUrl" },
});
