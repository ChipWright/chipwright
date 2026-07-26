// A Matter application cluster, identified by its cluster ID and human name. IDs follow the
// Matter Application Cluster specification.
export interface MatterCluster {
  id: number;
  name: string;
}

// Formats a cluster ID as the conventional 4-digit hex used in the Matter spec (e.g. 0x0201).
export function formatClusterId(id: number): string {
  return `0x${id.toString(16).padStart(4, "0")}`;
}

// Utility clusters the firmware and SDK provide for any device (identification, grouping,
// scenes, self-description, binding). A device definition is not expected to declare a capability
// for these, so conformance treats them as satisfied by the platform rather than by a capability.
export const PLATFORM_CLUSTERS = new Set<number>([
  0x0003, // Identify
  0x0004, // Groups
  0x0062, // Scenes Management
  0x001d, // Descriptor
  0x001e, // Binding
]);
