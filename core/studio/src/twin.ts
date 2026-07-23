// Twin driver for the IDE's live debugger. It launches the controllable twin binary
// (simulator/examples/twin_studio) and turns its NDJSON output into a callback stream of
// samples the shell can forward to a webview. The argument builder is pure so it can be
// unit tested, and the telemetry parsing is shared with the rest of the studio core, so
// the only untested surface is the process spawn itself.

import { spawn } from "node:child_process";
import { readTelemetry, type TwinSample } from "./telemetry.js";

export type TwinFault = "none" | "stuck" | "fail" | "offset";

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
