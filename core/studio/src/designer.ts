// Visual designer model. The designer edits a device as a structured form rather than raw
// YAML, so this module is the bridge between that form and the manifest: it reads a manifest
// into a form and serializes a form back into manifest YAML. Keeping both directions here
// means the designer's edit logic is unit tested in CI, and the shell only moves the form
// between the webview and these functions.

import { KNOWN_PROTOCOLS, parseManifest, type Protocol } from "@openhome/device-engine";
import { stringify } from "yaml";

export type FormCapability =
  | { key: string; kind: "sensor"; unit: string; min: number | null; max: number | null }
  | { key: string; kind: "actuator"; modes: string[] };

export interface DeviceForm {
  name: string;
  category: string;
  manufacturer: string;
  capabilities: FormCapability[];
  protocols: string[];
  battery: { enabled: boolean; rechargeable: boolean };
  encryption: boolean;
}

// The protocols the designer offers as choices. Sourced from the device engine so the form
// never drifts from what the compiler understands.
export const DESIGNER_PROTOCOLS: readonly Protocol[] = KNOWN_PROTOCOLS;

export function emptyForm(): DeviceForm {
  return {
    name: "",
    category: "",
    manufacturer: "",
    capabilities: [],
    protocols: [],
    battery: { enabled: false, rechargeable: false },
    encryption: false,
  };
}

// Reads a manifest into a form. An unparseable manifest yields an empty form so the designer
// still opens; diagnostics for the bad manifest are surfaced separately through validate.
export function manifestToForm(manifestYaml: string): DeviceForm {
  const { ir } = parseManifest(manifestYaml);
  if (ir === null) {
    return emptyForm();
  }
  return {
    name: ir.device.name,
    category: ir.device.category,
    manufacturer: ir.device.manufacturer ?? "",
    capabilities: ir.capabilities.map((cap) => {
      if (cap.kind === "sensor") {
        return {
          key: cap.key,
          kind: "sensor",
          unit: cap.unit ?? "",
          min: cap.range?.min ?? null,
          max: cap.range?.max ?? null,
        };
      }
      return { key: cap.key, kind: "actuator", modes: [...cap.modes] };
    }),
    protocols: [...ir.connectivity.protocols],
    battery:
      ir.power.battery !== null
        ? { enabled: true, rechargeable: ir.power.battery.rechargeable }
        : { enabled: false, rechargeable: false },
    encryption: ir.security.encryption.enabled,
  };
}

// Serializes a form into manifest YAML. Optional sections are emitted only when they carry
// information, so the generated manifest stays close to what a developer would write by hand.
export function formToManifest(form: DeviceForm): string {
  const device: Record<string, unknown> = { name: form.name };
  if (form.manufacturer.trim().length > 0) {
    device["manufacturer"] = form.manufacturer;
  }
  device["category"] = form.category;

  const capabilities: Record<string, unknown> = {};
  for (const cap of form.capabilities) {
    if (cap.kind === "sensor") {
      const entry: Record<string, unknown> = { type: "sensor" };
      if (cap.unit.trim().length > 0) {
        entry["unit"] = cap.unit;
      }
      if (cap.min !== null && cap.max !== null) {
        entry["range"] = { min: cap.min, max: cap.max };
      }
      capabilities[cap.key] = entry;
    } else {
      capabilities[cap.key] = { type: "actuator", modes: cap.modes };
    }
  }

  const manifest: Record<string, unknown> = {
    device,
    capabilities,
    connectivity: { protocols: form.protocols },
  };
  if (form.battery.enabled) {
    manifest["power"] = { battery: { rechargeable: form.battery.rechargeable } };
  }
  manifest["security"] = { encryption: { enabled: form.encryption } };

  return stringify(manifest);
}
