import type { DeviceIR, Diagnostic } from "@openhome/device-engine";
import { CLUSTER_TEMPERATURE_MEASUREMENT, CLUSTER_THERMOSTAT, type MatterCluster } from "./clusters.js";

export interface RequiredCluster {
  cluster: MatterCluster;
  mandatory: boolean;
}

// A semantic check beyond cluster presence: it returns a diagnostic when the rule is violated,
// or null when the device satisfies it.
export interface DeviceConstraint {
  describe: string;
  check(ir: DeviceIR): Diagnostic | null;
}

// A device-class conformance profile. It names the Matter device type the class maps to and the
// clusters an instance must (or may) provide, plus semantic constraints beyond cluster presence.
//
// In this phase the profiles are authored by hand for the classes the platform supports. A later
// phase derives them from the Matter Device Library so "conformant" tracks the published standard
// rather than our own encoding of it.
export interface DeviceProfile {
  class: string;
  matterDeviceType: number;
  matterDeviceTypeName: string;
  requires: RequiredCluster[];
  constraints: DeviceConstraint[];
}

const thermostatConstraints: DeviceConstraint[] = [
  {
    describe: "the hvac actuator must support an 'off' mode",
    check(ir) {
      const hvac = ir.capabilities.find((c) => c.key === "hvac");
      if (hvac !== undefined && hvac.kind === "actuator" && !hvac.modes.includes("off")) {
        return {
          severity: "error",
          path: "capabilities.hvac.modes",
          message: "a thermostat must support an 'off' mode",
        };
      }
      return null;
    },
  },
  {
    describe: "the temperature sensor should declare a measurement range",
    check(ir) {
      const temp = ir.capabilities.find((c) => c.key === "temperature_sensor");
      if (temp !== undefined && temp.kind === "sensor" && temp.range === null) {
        return {
          severity: "warning",
          path: "capabilities.temperature_sensor.range",
          message: "temperature_sensor has no declared range; controllers cannot bound the value",
        };
      }
      return null;
    },
  },
];

// The built-in class profiles. Keyed by class name (matched against a device's declared category).
export const PROFILES: Record<string, DeviceProfile> = {
  thermostat: {
    class: "thermostat",
    matterDeviceType: 0x0301,
    matterDeviceTypeName: "Thermostat",
    requires: [
      { cluster: CLUSTER_THERMOSTAT, mandatory: true },
      { cluster: CLUSTER_TEMPERATURE_MEASUREMENT, mandatory: false },
    ],
    constraints: thermostatConstraints,
  },
};

export function profileForClass(className: string): DeviceProfile | undefined {
  return PROFILES[className];
}
