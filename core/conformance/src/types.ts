import type { Diagnostic } from "@chipwright/device-engine";
import type { MatterCluster } from "./clusters.js";

// The conformance engine revision. Combined with the Matter data model version at report time, it
// makes reports reproducible: the same device and versions always yield the same report.
export const SPEC_VERSION = "chipwright-conformance-0.2";

export type ConformanceVerdict = "conformant" | "conformant_with_gaps" | "nonconformant";

// The result of checking one server cluster of the target device type.
export interface ClusterCheck {
  cluster: MatterCluster;
  mandatory: boolean;
  satisfied: boolean;
  // The capability providing the cluster, "platform" for infrastructure clusters, or null.
  providedBy: string | null;
}

// A capability that fills an attribute of a cluster, and whether that capability is present.
export interface AttributeMapping {
  capabilityKey: string;
  cluster: MatterCluster;
  attribute: string;
  present: boolean;
}

// A structured, reproducible conformance report for a device against its class profile.
export interface ConformanceReport {
  class: string;
  matterDeviceType: number | null;
  matterDeviceTypeName: string | null;
  verdict: ConformanceVerdict;
  clusters: ClusterCheck[];
  attributes: AttributeMapping[];
  diagnostics: Diagnostic[];
  specVersion: string;
}
