// Emits Markdown reference documentation from the manifest, so a device's docs are a
// generated artifact rather than a hand-maintained file that drifts from the source.

import type { Capability, DeviceIR } from "../schema.js";
import type { GeneratedFile, Generator } from "./index.js";

function capabilityRow(cap: Capability): string {
  if (cap.kind === "sensor") {
    const unit = cap.unit ?? "-";
    const range = cap.range !== null ? `${cap.range.min} to ${cap.range.max}` : "-";
    return `| \`${cap.key}\` | sensor | ${unit} | ${range} |`;
  }
  return `| \`${cap.key}\` | actuator | - | ${cap.modes.join(", ")} |`;
}

export const documentationGenerator: Generator = {
  name: "documentation",
  generate(ir: DeviceIR): GeneratedFile[] {
    const { device } = ir;
    const lines: string[] = [];

    lines.push(`# ${device.name}`, "");
    lines.push(`- Category: ${device.category}`);
    lines.push(`- Manufacturer: ${device.manufacturer ?? "unspecified"}`);
    lines.push(
      `- Encryption: ${ir.security.encryption.enabled ? "enabled" : "disabled"}`,
    );
    if (ir.power.battery !== null) {
      const kind = ir.power.battery.rechargeable ? "rechargeable" : "non-rechargeable";
      lines.push(`- Power: battery (${kind})`);
    }
    lines.push("");

    lines.push("## Capabilities", "");
    if (ir.capabilities.length === 0) {
      lines.push("This device declares no capabilities.", "");
    } else {
      lines.push("| Capability | Type | Unit | Range / Modes |");
      lines.push("| ---------- | ---- | ---- | ------------- |");
      for (const cap of ir.capabilities) {
        lines.push(capabilityRow(cap));
      }
      lines.push("");
    }

    lines.push("## Connectivity", "");
    if (ir.connectivity.protocols.length > 0) {
      lines.push(ir.connectivity.protocols.map((p) => `- ${p}`).join("\n"));
    } else {
      lines.push("No supported protocols.");
    }
    lines.push("");

    return [{ path: `docs/${device.name}.md`, contents: lines.join("\n") }];
  },
};
