import { hasErrors, parseManifest, type DeviceIR, type Diagnostic } from "@openhome/device-engine";
import { clusterForCapability, formatClusterId } from "./clusters.js";
import { profileForClass } from "./profiles.js";
import {
  SPEC_VERSION,
  type ClusterCheck,
  type ConformanceReport,
  type ConformanceVerdict,
} from "./types.js";

// Judges a device IR against a class profile: every mandatory Matter cluster for the device type
// must be provided by some capability, optional clusters are reported as gaps when absent, and the
// class's semantic constraints are checked. The profile is chosen by `profileId`, or by the
// device's declared category when `profileId` is omitted.
export function conform(ir: DeviceIR, profileId?: string): ConformanceReport {
  const className = profileId ?? ir.device.category;
  const profile = profileForClass(className);
  if (profile === undefined) {
    return {
      class: className,
      matterDeviceType: null,
      matterDeviceTypeName: null,
      verdict: "nonconformant",
      clusters: [],
      diagnostics: [
        {
          severity: "error",
          path: "device.category",
          message: `no conformance profile for class '${className}'`,
        },
      ],
      specVersion: SPEC_VERSION,
    };
  }

  // The clusters the generated device will actually expose, mapped to the capability providing each.
  const provided = new Map<number, string>();
  for (const capability of ir.capabilities) {
    const cluster = clusterForCapability(capability);
    if (cluster !== null && !provided.has(cluster.id)) {
      provided.set(cluster.id, capability.key);
    }
  }

  const diagnostics: Diagnostic[] = [];
  const clusters: ClusterCheck[] = profile.requires.map((req) => {
    const providedBy = provided.get(req.cluster.id) ?? null;
    const satisfied = providedBy !== null;
    if (!satisfied && req.mandatory) {
      diagnostics.push({
        severity: "error",
        path: "capabilities",
        message: `missing mandatory ${req.cluster.name} cluster (${formatClusterId(req.cluster.id)}) required by the ${profile.matterDeviceTypeName} device type`,
      });
    } else if (!satisfied) {
      diagnostics.push({
        severity: "warning",
        path: "capabilities",
        message: `optional ${req.cluster.name} cluster (${formatClusterId(req.cluster.id)}) is not provided`,
      });
    }
    return { cluster: req.cluster, mandatory: req.mandatory, satisfied, providedBy };
  });

  for (const constraint of profile.constraints) {
    const diagnostic = constraint.check(ir);
    if (diagnostic !== null) {
      diagnostics.push(diagnostic);
    }
  }

  const verdict: ConformanceVerdict = hasErrors(diagnostics)
    ? "nonconformant"
    : diagnostics.length > 0
      ? "conformant_with_gaps"
      : "conformant";

  return {
    class: profile.class,
    matterDeviceType: profile.matterDeviceType,
    matterDeviceTypeName: profile.matterDeviceTypeName,
    verdict,
    clusters,
    diagnostics,
    specVersion: SPEC_VERSION,
  };
}

// Parses a manifest and judges its conformance in one step. A manifest that fails to parse is
// nonconformant, with the parse errors surfaced. Parse warnings are a manifest-lint concern
// (see the device engine's validation) and are intentionally not folded into the conformance
// verdict, which is strictly about the device class.
export function conformManifest(source: string, profileId?: string): ConformanceReport {
  const { ir, diagnostics } = parseManifest(source);
  if (ir === null || hasErrors(diagnostics)) {
    const parseErrors = diagnostics.filter((d) => d.severity === "error");
    return {
      class: profileId ?? "unknown",
      matterDeviceType: null,
      matterDeviceTypeName: null,
      verdict: "nonconformant",
      clusters: [],
      diagnostics:
        parseErrors.length > 0
          ? parseErrors
          : [{ severity: "error", path: "", message: "manifest could not be parsed" }],
      specVersion: SPEC_VERSION,
    };
  }
  return conform(ir, profileId);
}
