// Conformance surface for the IDE. Wraps the conformance engine so the shell can show a
// developer, live as they edit, whether their device conforms to its class and its Matter
// device type. Like the rest of studio-core, the shell calls a plain function and never
// imports the engine directly.

import { conformManifest, type ConformanceReport, type ConformanceVerdict } from "@chipwright/conformance";

export type { ConformanceReport, ConformanceVerdict };

export interface ConformanceResult {
  // Whether a class profile applied. A device whose category has no profile cannot be
  // judged; the IDE shows that as "not assessed" rather than a failure.
  assessed: boolean;
  verdict: ConformanceVerdict;
  report: ConformanceReport;
}

// A profile is missing when the engine reports nonconformance solely because the class has
// no profile. That single diagnostic is on device.category with a distinctive message.
function hasProfile(report: ConformanceReport): boolean {
  if (report.matterDeviceType !== null) {
    return true;
  }
  return !report.diagnostics.some(
    (d) => d.path === "device.category" && d.message.startsWith("no conformance profile"),
  );
}

// Judges manifest YAML for conformance against its class profile. The verdict and full
// report are returned for the IDE to render; assessed is false when no profile covers the
// device's category, so the shell can distinguish "unknown class" from "nonconformant".
export function conformance(manifestYaml: string): ConformanceResult {
  const report = conformManifest(manifestYaml);
  return {
    assessed: hasProfile(report),
    verdict: report.verdict,
    report,
  };
}
