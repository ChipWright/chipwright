// Twin driver for the IDE's live debugger. It launches the controllable twin binary
// (simulator/examples/twin_studio) and turns its NDJSON output into a callback stream of
// samples the shell can forward to a webview. The argument builder is pure so it can be
// unit tested, and the telemetry parsing is shared with the rest of the studio core, so
// the only untested surface is the process spawn itself.

import { spawn } from "node:child_process";
import { join } from "node:path";
import { parseManifest } from "@chipwright/device-engine";
import { readTelemetry, type TwinSample } from "./telemetry.js";

export type TwinFault = "none" | "stuck" | "fail" | "offset";

// Location of the controllable twin binary relative to the repository root. The shell uses
// this to find (and build, if missing) the binary it hands to spawnTwin.
export const TWIN_SOURCE_DIR = join("simulator", "examples", "twin_studio");

export function twinBinaryPath(repoRoot: string): string {
  return join(repoRoot, TWIN_SOURCE_DIR, "build", "twin_studio");
}

export interface TwinOptions {
  // Absolute path to the compiled twin_studio binary.
  binPath: string;
  ticks?: number;
  intervalMs?: number;
  initial?: number;
  step?: number;
  fault?: TwinFault;
  // Tick at which to inject the fault; negative or undefined means no injection.
  faultAt?: number;
  offset?: number;
  // Path to a device descriptor so the twin runs the open device's capabilities rather than
  // its built-in default. Produced by twinPlan and written to a temp file by the shell.
  descriptorPath?: string;
  // Sensor key the fault applies to; when unset the twin faults its first sensor.
  faultTarget?: string;
}

// A sensor exposed by the twin: its key and the unit its telemetry is reported in. The shell
// uses this to label chart series and to offer a fault target per sensor.
export interface TwinSensorPlan {
  key: string;
  unit: string;
}

// Everything the shell needs to run a manifest on the twin: the sensors it will stream, its
// actuators, and the descriptor text to hand the binary. Null when the manifest does not compile.
export interface TwinCapabilityPlan {
  deviceName: string;
  sensors: TwinSensorPlan[];
  actuators: string[];
  descriptor: string;
}

// Derives the twin plan from a manifest: the descriptor text the twin binary consumes plus the
// capability lists the debugger UI needs. Returns null when the manifest does not compile, so
// the shell surfaces diagnostics rather than running an empty device.
export function twinPlan(manifestYaml: string): TwinCapabilityPlan | null {
  const { ir } = parseManifest(manifestYaml);
  if (ir === null) {
    return null;
  }
  const sensors: TwinSensorPlan[] = [];
  const actuators: string[] = [];
  const lines = [`device ${ir.device.name}`];
  for (const cap of ir.capabilities) {
    if (cap.kind === "sensor") {
      const unit = cap.unit ?? "unitless";
      sensors.push({ key: cap.key, unit });
      lines.push(
        cap.range !== null
          ? `sensor ${cap.key} ${unit} ${cap.range.min} ${cap.range.max}`
          : `sensor ${cap.key} ${unit}`,
      );
    } else {
      actuators.push(cap.key);
      lines.push(`actuator ${cap.key} ${cap.modes.length}`);
    }
  }
  return { deviceName: ir.device.name, sensors, actuators, descriptor: lines.join("\n") + "\n" };
}

export interface TwinHandlers {
  onSample: (sample: TwinSample) => void;
  onExit?: (code: number | null) => void;
  onError?: (error: Error) => void;
}

export interface TwinHandle {
  stop: () => void;
}

// Builds the command-line arguments for the twin binary from options, emitting only the
// flags the caller set so the binary's own defaults apply otherwise.
export function twinArgs(options: TwinOptions): string[] {
  const args: string[] = [];
  if (options.descriptorPath !== undefined) {
    args.push("--descriptor", options.descriptorPath);
  }
  if (options.ticks !== undefined) {
    args.push("--ticks", String(options.ticks));
  }
  if (options.intervalMs !== undefined) {
    args.push("--interval-ms", String(options.intervalMs));
  }
  if (options.initial !== undefined) {
    args.push("--initial", String(options.initial));
  }
  if (options.step !== undefined) {
    args.push("--step", String(options.step));
  }
  if (options.fault !== undefined && options.fault !== "none") {
    args.push("--fault", options.fault);
    if (options.faultAt !== undefined && options.faultAt >= 0) {
      args.push("--fault-at", String(options.faultAt));
    }
    if (options.offset !== undefined) {
      args.push("--offset", String(options.offset));
    }
    if (options.faultTarget !== undefined && options.faultTarget.length > 0) {
      args.push("--fault-target", options.faultTarget);
    }
  }
  return args;
}

// Spawns the twin and streams its telemetry to the handlers. Returns a handle whose stop()
// terminates the twin early, for when the developer closes or restarts the debugger.
export function spawnTwin(options: TwinOptions, handlers: TwinHandlers): TwinHandle {
  const child = spawn(options.binPath, twinArgs(options), { stdio: ["ignore", "pipe", "pipe"] });

  child.on("error", (error) => {
    handlers.onError?.(error);
  });
  child.on("exit", (code) => {
    handlers.onExit?.(code);
  });

  if (child.stdout !== null) {
    void (async () => {
      for await (const sample of readTelemetry(child.stdout)) {
        handlers.onSample(sample);
      }
    })();
  }

  return {
    stop: () => {
      child.kill();
    },
  };
}
