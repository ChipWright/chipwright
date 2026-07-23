// Telemetry bridge: reads NDJSON telemetry samples from stdin (as emitted by the C uplink
// firmware) and forwards them to a running cloud over HTTP. It registers the device once,
// then posts each sample so the device shadow reflects live readings. This connects the C
// device end to the TypeScript cloud without embedding a network stack in the firmware.

import { createInterface } from "node:readline";
import { argv } from "node:process";
import { pathToFileURL } from "node:url";
import type { TelemetrySample } from "../shadow.js";

interface BridgeOptions {
  base: string;
  deviceId: string;
  deviceType: string;
}

function parseSample(line: string): TelemetrySample | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>)["metric"] !== "string" ||
    typeof (parsed as Record<string, unknown>)["value"] !== "number" ||
    typeof (parsed as Record<string, unknown>)["unit"] !== "string"
  ) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  return { metric: record["metric"] as string, value: record["value"] as number, unit: record["unit"] as string };
}

async function ensureDevice(options: BridgeOptions): Promise<void> {
  const response = await fetch(`${options.base}/devices`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId: options.deviceId, deviceType: options.deviceType }),
  });
  // A 409 means the device is already registered, which is fine for a reconnecting bridge.
  if (response.status !== 201 && response.status !== 409) {
    throw new Error(`device registration failed: HTTP ${response.status}`);
  }
}

async function forward(options: BridgeOptions, sample: TelemetrySample): Promise<void> {
  const response = await fetch(`${options.base}/devices/${options.deviceId}/telemetry`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ samples: [sample] }),
  });
  if (response.status !== 202) {
    throw new Error(`telemetry ingest failed: HTTP ${response.status}`);
  }
}

export async function runBridge(options: BridgeOptions, input: NodeJS.ReadableStream): Promise<number> {
  await ensureDevice(options);
  let forwarded = 0;
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    const sample = parseSample(line);
    if (sample === null) {
      process.stderr.write(`skipping unparseable line: ${line}\n`);
      continue;
    }
    await forward(options, sample);
    forwarded++;
  }
  return forwarded;
}

async function main(): Promise<void> {
  const options: BridgeOptions = {
    base: process.env["CLOUD_BASE"] ?? "http://127.0.0.1:8080",
    deviceId: process.env["DEVICE_ID"] ?? "smart_thermostat",
    deviceType: process.env["DEVICE_TYPE"] ?? "thermostat",
  };
  const forwarded = await runBridge(options, process.stdin);
  process.stdout.write(`forwarded ${forwarded} sample(s) to ${options.base}\n`);
}

// Run only when invoked directly, so the module can also be imported by tests.
const invokedPath = argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`bridge error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
