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
  manifestToForm,
  formToManifest,
  emptyForm,
  DESIGNER_PROTOCOLS,
  type DeviceForm,
  type FormCapability,
} from "./designer.js";
export {
  parseSampleLine,
  readTelemetry,
  type TwinSample,
} from "./telemetry.js";
export {
  twinArgs,
  spawnTwin,
  twinBinaryPath,
  TWIN_SOURCE_DIR,
  type TwinFault,
  type TwinOptions,
  type TwinHandlers,
  type TwinHandle,
} from "./twin.js";
