// Validates a parsed manifest object and normalizes it into a DeviceIR. Validation is
// hand-written rather than schema-driven so diagnostics can be precise and dependency
// free; a JSON Schema export can be layered on later without changing the IR contract.

import {
  KNOWN_PROTOCOLS,
  type Capability,
  type DeviceIR,
  type Diagnostic,
  type Protocol,
} from "./schema.js";

const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

type Obj = Record<string, unknown>;

function isObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProtocol(value: string): value is Protocol {
  return (KNOWN_PROTOCOLS as readonly string[]).includes(value);
}

// Collects diagnostics against a single manifest and produces an IR when the manifest
// is structurally sound enough to build one.
class Validator {
  readonly diagnostics: Diagnostic[] = [];

  error(path: string, message: string): void {
    this.diagnostics.push({ severity: "error", path, message });
  }

  warn(path: string, message: string): void {
    this.diagnostics.push({ severity: "warning", path, message });
  }

  validate(root: unknown): DeviceIR | null {
    if (!isObject(root)) {
      this.error("", "manifest must be a mapping");
      return null;
    }

    const device = this.validateDevice(root["device"]);
    const capabilities = this.validateCapabilities(root["capabilities"]);
    const connectivity = this.validateConnectivity(root["connectivity"]);
    const power = this.validatePower(root["power"]);
    const security = this.validateSecurity(root["security"]);

    if (device === null) {
      return null;
    }

    return { device, capabilities, connectivity, power, security };
  }

  private validateDevice(value: unknown): DeviceIR["device"] | null {
    if (!isObject(value)) {
      this.error("device", "a `device` mapping is required");
      return null;
    }

    const name = value["name"];
    if (typeof name !== "string" || name.length === 0) {
      this.error("device.name", "`device.name` is required and must be a string");
      return null;
    }
    if (!NAME_PATTERN.test(name)) {
      this.error(
        "device.name",
        "`device.name` must be lower_snake_case so it is safe to use in generated code",
      );
      return null;
    }

    const category = value["category"];
    if (typeof category !== "string" || category.length === 0) {
      this.error("device.category", "`device.category` is required and must be a string");
    }

    const manufacturer = value["manufacturer"];
    if (manufacturer !== undefined && typeof manufacturer !== "string") {
      this.warn("device.manufacturer", "`device.manufacturer` should be a string; ignoring");
    }

    return {
      name,
      manufacturer: typeof manufacturer === "string" ? manufacturer : null,
      category: typeof category === "string" ? category : "unknown",
    };
  }

  private validateCapabilities(value: unknown): Capability[] {
    if (value === undefined) {
      this.warn("capabilities", "device declares no capabilities");
      return [];
    }
    if (!isObject(value)) {
      this.error("capabilities", "`capabilities` must be a mapping of capability keys");
      return [];
    }

    const result: Capability[] = [];
    for (const [key, raw] of Object.entries(value)) {
      const capability = this.validateCapability(key, raw);
      if (capability !== null) {
        result.push(capability);
      }
    }
    return result;
  }

  private validateCapability(key: string, value: unknown): Capability | null {
    const path = `capabilities.${key}`;
    if (!NAME_PATTERN.test(key)) {
      this.error(path, "capability key must be lower_snake_case");
      return null;
    }
    if (!isObject(value)) {
      this.error(path, "capability definition must be a mapping");
      return null;
    }

    const type = value["type"];
    if (type === "sensor") {
      return this.validateSensor(key, path, value);
    }
    if (type === "actuator") {
      return this.validateActuator(key, path, value);
    }
    this.error(`${path}.type`, "capability `type` must be either `sensor` or `actuator`");
    return null;
  }

  private validateSensor(key: string, path: string, value: Obj): Capability {
    const unit = value["unit"];
    if (unit !== undefined && typeof unit !== "string") {
      this.warn(`${path}.unit`, "sensor `unit` should be a string; ignoring");
    }
    if (unit === undefined) {
      this.warn(`${path}.unit`, "sensor has no `unit`; generated readings will be unitless");
    }

    let range: { min: number; max: number } | null = null;
    const rawRange = value["range"];
    if (rawRange !== undefined) {
      if (!isObject(rawRange) || typeof rawRange["min"] !== "number" || typeof rawRange["max"] !== "number") {
        this.error(`${path}.range`, "`range` must have numeric `min` and `max`");
      } else if (rawRange["min"] >= rawRange["max"]) {
        this.error(`${path}.range`, "`range.min` must be less than `range.max`");
      } else {
        range = { min: rawRange["min"], max: rawRange["max"] };
      }
    }

    return {
      kind: "sensor",
      key,
      unit: typeof unit === "string" ? unit : null,
      range,
    };
  }

  private validateActuator(key: string, path: string, value: Obj): Capability | null {
    const rawModes = value["modes"];
    if (!Array.isArray(rawModes) || rawModes.length === 0) {
      this.error(`${path}.modes`, "actuator requires a non-empty `modes` list");
      return null;
    }

    const modes: string[] = [];
    for (const [index, mode] of rawModes.entries()) {
      if (typeof mode !== "string" || !NAME_PATTERN.test(mode)) {
        this.error(`${path}.modes[${index}]`, "each mode must be a lower_snake_case string");
        continue;
      }
      modes.push(mode);
    }
    if (modes.length === 0) {
      return null;
    }

    return { kind: "actuator", key, modes };
  }

  private validateConnectivity(value: unknown): DeviceIR["connectivity"] {
    if (!isObject(value)) {
      this.error("connectivity", "a `connectivity` mapping with `protocols` is required");
      return { protocols: [], unknownProtocols: [] };
    }

    const rawProtocols = value["protocols"];
    if (!Array.isArray(rawProtocols) || rawProtocols.length === 0) {
      this.error("connectivity.protocols", "at least one protocol is required");
      return { protocols: [], unknownProtocols: [] };
    }

    const protocols: Protocol[] = [];
    const unknownProtocols: string[] = [];
    for (const [index, entry] of rawProtocols.entries()) {
      if (typeof entry !== "string") {
        this.error(`connectivity.protocols[${index}]`, "protocol must be a string");
        continue;
      }
      if (isProtocol(entry)) {
        protocols.push(entry);
      } else {
        unknownProtocols.push(entry);
        this.warn(
          `connectivity.protocols[${index}]`,
          `unknown protocol "${entry}"; no adapter will be generated`,
        );
      }
    }

    return { protocols, unknownProtocols };
  }

  private validatePower(value: unknown): DeviceIR["power"] {
    if (value === undefined) {
      return { battery: null };
    }
    if (!isObject(value)) {
      this.warn("power", "`power` should be a mapping; ignoring");
      return { battery: null };
    }

    const rawBattery = value["battery"];
    if (rawBattery === undefined) {
      return { battery: null };
    }
    if (!isObject(rawBattery)) {
      this.warn("power.battery", "`power.battery` should be a mapping; ignoring");
      return { battery: null };
    }

    const rechargeable = rawBattery["rechargeable"];
    return { battery: { rechargeable: rechargeable === true } };
  }

  private validateSecurity(value: unknown): DeviceIR["security"] {
    const disabled = { encryption: { enabled: false } };
    if (value === undefined) {
      this.warn("security", "device declares no security block; encryption defaults to off");
      return disabled;
    }
    if (!isObject(value)) {
      this.warn("security", "`security` should be a mapping; ignoring");
      return disabled;
    }

    const encryption = value["encryption"];
    if (!isObject(encryption)) {
      return disabled;
    }
    return { encryption: { enabled: encryption["enabled"] === true } };
  }
}

export function validateManifest(root: unknown): { ir: DeviceIR | null; diagnostics: Diagnostic[] } {
  const validator = new Validator();
  const ir = validator.validate(root);
  return { ir, diagnostics: validator.diagnostics };
}
