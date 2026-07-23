// Public API of the device engine.

export const version = "0.0.0";

export * from "./schema.js";
export { validateManifest } from "./validate.js";
export { parseManifest, loadManifestFile } from "./parse.js";
export { compile, writeArtifacts } from "./compile.js";
export {
  type Generator,
  type GeneratedFile,
  defaultGenerators,
  firmwareInterfaceGenerator,
  documentationGenerator,
} from "./generators/index.js";
