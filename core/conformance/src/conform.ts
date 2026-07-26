import { hasErrors, parseManifest, type DeviceIR, type Diagnostic } from "@openhome/device-engine";
import { PLATFORM_CLUSTERS, formatClusterId } from "./clusters.js";
import { MATTER_DATA_MODEL_VERSION, MATTER_DEVICE_TYPES } from "./matter-device-types.generated.js";
import { profileForClass } from "./profiles.js";
import {
  SPEC_VERSION,
  type AttributeMapping,
  type ClusterCheck,
  type ConformanceReport,
  type ConformanceVerdict,
} from "./types.js";

function reportSpecVersion(): string {
  return `${SPEC_VERSION}+matter-${MATTER_DATA_MODEL_VERSION}`;
}

function nonconformant(className: string, diagnostics: Diagnostic[]): ConformanceReport {
  return {
    class: className,
    matterDeviceType: null,
    matterDeviceTypeName: null,
    verdict: "nonconformant",
    clusters: [],
    attributes: [],
    diagnostics,
    specVersion: reportSpecVersion(),
  };
}

// Judges a device IR against a class profile. The device type's required clusters come from the
// generated Matter Device Library: every mandatory server cluster must be provided by a capability
// or by the platform (for infrastructure clusters), optional clusters are recorded but not
// required, capabilities that fill cluster attributes are mapped, and the class's semantic
// constraints run. The profile is chosen by `profileId`, or by the device's category when omitted.
export function conform(ir: DeviceIR, profileId?: string): ConformanceReport {
  const className = profileId ?? ir.device.category;
  const profile = profileForClass(className);
  if (profile === undefined) {
    return nonconformant(className, [
      {
        severity: "error",
        path: "device.category",
        message: `no conformance profile for class '${className}'`,
      },
    ]);
  }

  const deviceType = MATTER_DEVICE_TYPES[profile.matterDeviceType];
  if (deviceType === undefined) {
    return nonconformant(className, [
      {
        severity: "error",
        path: "",
        message: `profile references unknown Matter device type ${formatClusterId(profile.matterDeviceType)}`,
      },
    ]);
  }

  const capabilityKeys = new Set(ir.capabilities.map((c) => c.key));

  // Application clusters provided by a present capability: cluster id -> capability key.
  const provided = new Map<number, string>();
  for (const [capabilityKey, clusterId] of Object.entries(profile.capabilityClusters)) {
    if (capabilityKeys.has(capabilityKey)) {
      provided.set(clusterId, capabilityKey);
    }
  }

  const diagnostics: Diagnostic[] = [];
  const clusters: ClusterCheck[] = deviceType.serverClusters.map((req) => {
    const mandatory = req.conformance === "mandatory";
    let providedBy = provided.get(req.id) ?? null;
    if (providedBy === null && PLATFORM_CLUSTERS.has(req.id)) {
      providedBy = "platform";
    }
    const satisfied = providedBy !== null;
    // Only a missing mandatory application cluster is a conformance failure. Absent optional
    // clusters are normal and are recorded without a diagnostic.
    if (!satisfied && mandatory) {
      diagnostics.push({
        severity: "error",
        path: "capabilities",
        message: `missing mandatory ${req.name} cluster (${formatClusterId(req.id)}) required by the ${deviceType.name} device type`,
      });
    }
    return { cluster: { id: req.id, name: req.name }, mandatory, satisfied, providedBy };
  });

  const attributes: AttributeMapping[] = profile.capabilityAttributes.map((mapping) => ({
    capabilityKey: mapping.capabilityKey,
    cluster: {
      id: mapping.cluster,
      name: deviceType.serverClusters.find((c) => c.id === mapping.cluster)?.name ?? "unknown",
    },
    attribute: mapping.attribute,
    present: capabilityKeys.has(mapping.capabilityKey),
  }));

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
    matterDeviceType: deviceType.id,
    matterDeviceTypeName: deviceType.name,
    verdict,
    clusters,
    attributes,
    diagnostics,
    specVersion: reportSpecVersion(),
  };
}

// Parses a manifest and judges its conformance in one step. A manifest that fails to parse is
// nonconformant, with the parse errors surfaced. Parse warnings are a manifest-lint concern (see
// the device engine's validation) and are intentionally not folded into the conformance verdict,
// which is strictly about the device class.
export function conformManifest(source: string, profileId?: string): ConformanceReport {
  const { ir, diagnostics } = parseManifest(source);
  if (ir === null || hasErrors(diagnostics)) {
    const parseErrors = diagnostics.filter((d) => d.severity === "error");
    return nonconformant(
      profileId ?? "unknown",
      parseErrors.length > 0
        ? parseErrors
        : [{ severity: "error", path: "", message: "manifest could not be parsed" }],
    );
  }
  return conform(ir, profileId);
}
