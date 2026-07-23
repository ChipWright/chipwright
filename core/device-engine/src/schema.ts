// Types for the Device Definition Language: the raw manifest shape as authored, and
// the normalized intermediate representation (IR) that generator backends consume.

export const KNOWN_PROTOCOLS = [
  "matter",
  "thread",
  "bluetooth",
  "wifi",
  "zigbee",
  "zwave",
  "mqtt",
  "rest",
] as const;

export type Protocol = (typeof KNOWN_PROTOCOLS)[number];

export type CapabilityKind = "sensor" | "actuator";

export interface SensorCapability {
  kind: "sensor";
  key: string;
  unit: string | null;
  range: { min: number; max: number } | null;
}

export interface ActuatorCapability {
  kind: "actuator";
  key: string;
  modes: string[];
}

export type Capability = SensorCapability | ActuatorCapability;

// The normalized device model. Every field is fully resolved so generators never deal
// with optional or malformed input.
export interface DeviceIR {
  device: {
    name: string;
    manufacturer: string | null;
    category: string;
  };
  capabilities: Capability[];
  connectivity: {
    protocols: Protocol[];
    unknownProtocols: string[];
  };
  power: {
    battery: { rechargeable: boolean } | null;
  };
  security: {
    encryption: { enabled: boolean };
  };
}

export type Severity = "error" | "warning";

export interface Diagnostic {
  severity: Severity;
  path: string;
  message: string;
}

export interface ParseResult {
  ir: DeviceIR | null;
  diagnostics: Diagnostic[];
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}
