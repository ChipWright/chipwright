import type { DeviceIR, Diagnostic } from "@openhome/device-engine";

// A capability that fills an attribute of a device type's cluster rather than providing a whole
// cluster of its own. Under the one-device-type-per-endpoint model, a thermostat's temperature
// reading is the Thermostat cluster's LocalTemperature attribute, not a separate cluster.
export interface CapabilityAttribute {
  capabilityKey: string;
  cluster: number;
  attribute: string;
  describe: string;
}

// A semantic check beyond cluster presence: it returns a diagnostic when the rule is violated,
// or null when the device satisfies it.
export interface DeviceConstraint {
  describe: string;
  check(ir: DeviceIR): Diagnostic | null;
}

// A device-class conformance profile. It binds a class to a Matter device type (whose required
// clusters come from the generated Matter Device Library, not from this file), declares which
// capability provides each application cluster, maps capabilities that fill cluster attributes,
// and adds semantic constraints the spec does not encode.
export interface DeviceProfile {
  class: string;
  matterDeviceType: number;
  capabilityClusters: Record<string, number>;
  capabilityAttributes: CapabilityAttribute[];
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
    describe: "a thermostat should have a local temperature source",
    check(ir) {
      const temp = ir.capabilities.find((c) => c.key === "temperature_sensor");
      if (temp === undefined) {
        return {
          severity: "warning",
          path: "capabilities",
          message:
            "no temperature_sensor: the Thermostat cluster's LocalTemperature attribute has no source",
        };
      }
      if (temp.kind === "sensor" && temp.range === null) {
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

const smartPlugConstraints: DeviceConstraint[] = [
  {
    describe: "the outlet actuator must support 'on' and 'off' modes",
    check(ir) {
      const outlet = ir.capabilities.find((c) => c.key === "outlet");
      if (
        outlet !== undefined &&
        outlet.kind === "actuator" &&
        !(outlet.modes.includes("on") && outlet.modes.includes("off"))
      ) {
        return {
          severity: "error",
          path: "capabilities.outlet.modes",
          message: "a smart plug's outlet must support both 'on' and 'off'",
        };
      }
      return null;
    },
  },
];

// The built-in class profiles, keyed by class name (matched against a device's declared category).
export const PROFILES: Record<string, DeviceProfile> = {
  thermostat: {
    class: "thermostat",
    matterDeviceType: 0x0301,
    capabilityClusters: { hvac: 0x0201 },
    capabilityAttributes: [
      {
        capabilityKey: "temperature_sensor",
        cluster: 0x0201,
        attribute: "LocalTemperature",
        describe: "temperature_sensor reports through the Thermostat cluster's LocalTemperature",
      },
    ],
    constraints: thermostatConstraints,
  },
  smart_plug: {
    class: "smart_plug",
    matterDeviceType: 0x010a,
    capabilityClusters: { outlet: 0x0006 },
    capabilityAttributes: [],
    constraints: smartPlugConstraints,
  },
};

export function profileForClass(className: string): DeviceProfile | undefined {
  return PROFILES[className];
}
