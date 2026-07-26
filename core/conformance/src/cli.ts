// CLI for the conformance engine: `openhome-conform <device.yaml> [--class <class>] [--json]`.
// Prints a human-readable report by default, or the raw report with --json. Exits non-zero when
// the device is nonconformant, so it can gate a build or a publish.

import { readFileSync } from "node:fs";
import { formatClusterId } from "./clusters.js";
import { conformManifest } from "./conform.js";
import type { ConformanceReport } from "./types.js";

function render(report: ConformanceReport): string {
  const lines: string[] = [];
  const deviceType =
    report.matterDeviceType !== null
      ? `${report.matterDeviceTypeName} (${formatClusterId(report.matterDeviceType)})`
      : "unknown device type";
  lines.push(`class:              ${report.class}`);
  lines.push(`matter device type: ${deviceType}`);
  lines.push(`verdict:            ${report.verdict}`);
  if (report.clusters.length > 0) {
    lines.push("clusters:");
    for (const c of report.clusters) {
      const status = c.satisfied ? "ok" : c.mandatory ? "MISSING" : "absent (optional)";
      const by = c.providedBy !== null ? ` <- ${c.providedBy}` : "";
      lines.push(`  [${status}] ${c.cluster.name} (${formatClusterId(c.cluster.id)})${by}`);
    }
  }
  if (report.attributes.length > 0) {
    lines.push("attributes:");
    for (const a of report.attributes) {
      const status = a.present ? "ok" : "no source";
      lines.push(`  [${status}] ${a.cluster.name}.${a.attribute} <- ${a.capabilityKey}`);
    }
  }
  if (report.diagnostics.length > 0) {
    lines.push("diagnostics:");
    for (const d of report.diagnostics) {
      lines.push(`  ${d.severity}: ${d.path ? `${d.path}: ` : ""}${d.message}`);
    }
  }
  lines.push(`spec:               ${report.specVersion}`);
  return lines.join("\n");
}

function main(): void {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const classIndex = args.indexOf("--class");
  const profileId = classIndex >= 0 ? args[classIndex + 1] : undefined;
  const classValueIndex = classIndex >= 0 ? classIndex + 1 : -1;
  const file = args.find((arg, i) => !arg.startsWith("--") && i !== classValueIndex);
  if (file === undefined) {
    process.stderr.write("usage: openhome-conform <device.yaml> [--class <class>] [--json]\n");
    process.exit(2);
  }

  const report = conformManifest(readFileSync(file, "utf8"), profileId);
  process.stdout.write(`${json ? JSON.stringify(report, null, 2) : render(report)}\n`);
  process.exit(report.verdict === "nonconformant" ? 1 : 0);
}

main();
