// Public API of the studio core: the shell-agnostic logic behind the developer IDE. The
// VS Code extension and any future standalone app consume only this surface, so switching
// the shell never touches manifest handling, artifact generation, or twin control.

export const version = "0.0.0";

export {
  validate,
  generate,
  type ValidationResult,
  type GenerationResult,
} from "./manifest.js";
export {
  conformance,
  type ConformanceResult,
  type ConformanceReport,
  type ConformanceVerdict,
} from "./conformance.js";
export {
  scaffold,
  type ScaffoldFile,
  type ScaffoldResult,
} from "./scaffold.js";
export {
  manifestToForm,
  formToManifest,
  emptyForm,
  DESIGNER_PROTOCOLS,
  DEVICE_TEMPLATES,
  type DeviceForm,
  type FormCapability,
  type DeviceTemplate,
} from "./designer.js";
export {
  parseSampleLine,
  readTelemetry,
  type TwinSample,
} from "./telemetry.js";
export {
  twinArgs,
  twinPlan,
  spawnTwin,
  twinBinaryPath,
  TWIN_SOURCE_DIR,
  type TwinFault,
  type TwinOptions,
  type TwinHandlers,
  type TwinHandle,
  type TwinSensorPlan,
  type TwinCapabilityPlan,
} from "./twin.js";
