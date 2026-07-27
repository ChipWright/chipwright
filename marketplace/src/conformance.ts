// Conformance for marketplace packages. A package's device manifest is judged against its
// class profile so the registry can record, and optionally gate on, how well a published
// device conforms to its Matter device type. This reuses the conformance engine directly;
// the marketplace does not reimplement any of the judgement.

import { conformManifest, type ConformanceReport } from "@openhome/conformance";
import { DEVICE_MANIFEST_FILE, type DevicePackage } from "./package.js";

// Judges a package's device manifest for conformance. The profile is chosen by the
// manifest's category unless overridden. A package without a device manifest cannot be
// judged and returns null; validatePackage already rejects such packages at publish.
export function packageConformance(
  pkg: DevicePackage,
  profileId?: string,
): ConformanceReport | null {
  const manifest = pkg.files[DEVICE_MANIFEST_FILE];
  if (manifest === undefined) {
    return null;
  }
  return conformManifest(manifest, profileId);
}
