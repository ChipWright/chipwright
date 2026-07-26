import type { Capability } from "@openhome/device-engine";

// A Matter application cluster, identified by its cluster ID and human name. IDs follow the
// Matter Application Cluster specification.
export interface MatterCluster {
  id: number;
  name: string;
}

export const CLUSTER_TEMPERATURE_MEASUREMENT: MatterCluster = {
  id: 0x0402,
  name: "TemperatureMeasurement",
};
export const CLUSTER_THERMOSTAT: MatterCluster = { id: 0x0201, name: "Thermostat" };
export const CLUSTER_ON_OFF: MatterCluster = { id: 0x0006, name: "OnOff" };

// Maps a device capability to the Matter cluster it provides. This mirrors the runtime
// capability-to-cluster mapping the firmware uses, so conformance is judged against the clusters
// the generated device will actually expose. A capability with no standard cluster returns null.
export function clusterForCapability(capability: Capability): MatterCluster | null {
  if (capability.kind === "sensor") {
    if (capability.key === "temperature_sensor") {
      return CLUSTER_TEMPERATURE_MEASUREMENT;
    }
    return null;
  }
  if (capability.key === "hvac") {
    return CLUSTER_THERMOSTAT;
  }
  return CLUSTER_ON_OFF;
}

// Formats a cluster ID as the conventional 4-digit hex used in the Matter spec (e.g. 0x0201).
export function formatClusterId(id: number): string {
  return `0x${id.toString(16).padStart(4, "0")}`;
}
