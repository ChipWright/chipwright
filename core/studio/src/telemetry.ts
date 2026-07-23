// Telemetry parsing for the twin debugger. The twin emits one NDJSON sample per line on
// stdout, interleaved with human-readable log lines; this module turns that byte stream
// into a sequence of typed samples, silently skipping anything that is not a telemetry
// line. It has no process or shell dependency so it can be unit tested against a canned
// stream, the same way the cloud bridge is tested.

import { createInterface } from "node:readline";

// A single telemetry reading. The shape matches the C SDK sink, the cloud bridge, and the
// device shadow, so a sample flows through every layer unchanged.
export interface TwinSample {
  metric: string;
  value: number;
  unit: string;
}

// Parses one line into a sample, or returns null if the line is not a telemetry sample
// (a log line, blank line, or malformed JSON).
export function parseSampleLine(line: string): TwinSample | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (
    typeof record["metric"] !== "string" ||
    typeof record["value"] !== "number" ||
    typeof record["unit"] !== "string"
  ) {
    return null;
  }
  return { metric: record["metric"], value: record["value"], unit: record["unit"] };
}

// Reads a byte stream line by line and yields each telemetry sample as it arrives.
export async function* readTelemetry(
  input: NodeJS.ReadableStream,
): AsyncGenerator<TwinSample> {
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    const sample = parseSampleLine(line);
    if (sample !== null) {
      yield sample;
    }
  }
}
