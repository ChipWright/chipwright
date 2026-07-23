// Generator backends turn a DeviceIR into downstream artifacts. Each generator is
// independent and returns files with repository-relative paths, so new backends (cloud
// API, tests, certification checklist) can be added without touching the compiler.

import type { DeviceIR } from "../schema.js";

export interface GeneratedFile {
  path: string;
  contents: string;
}

export interface Generator {
  name: string;
  generate(ir: DeviceIR): GeneratedFile[];
}

export { firmwareInterfaceGenerator } from "./firmware-interface.js";
export { documentationGenerator } from "./docs.js";
export { cloudApiGenerator } from "./cloud-api.js";
export { testStubGenerator } from "./test-stub.js";

import { firmwareInterfaceGenerator } from "./firmware-interface.js";
import { documentationGenerator } from "./docs.js";
import { cloudApiGenerator } from "./cloud-api.js";
import { testStubGenerator } from "./test-stub.js";

export const defaultGenerators: Generator[] = [
  firmwareInterfaceGenerator,
  documentationGenerator,
  cloudApiGenerator,
  testStubGenerator,
];
