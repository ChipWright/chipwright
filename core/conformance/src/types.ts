import type { Diagnostic } from "@openhome/device-engine";
import type { MatterCluster } from "./clusters.js";

// The conformance spec revision a report was produced against. Reports are reproducible: the same
// device and spec version always yield the same report.
export const SPEC_VERSION = "openhome-conformance-0.1";

export type ConformanceVerdict = "conformant" | "conformant_with_gaps" | "nonconformant";

// The result of checking one required cluster of the target device type.
export interface ClusterCheck {
  cluster: MatterCluster;
  mandatory: boolean;
  satisfied: boolean;
  providedBy: string | null;
}

// A structured, reproducible conformance report for a device against its class profile.
export interface ConformanceReport {
  class: string;
  matterDeviceType: number | null;
  matterDeviceTypeName: string | null;
  verdict: ConformanceVerdict;
  clusters: ClusterCheck[];
  diagnostics: Diagnostic[];
  specVersion: string;
}
