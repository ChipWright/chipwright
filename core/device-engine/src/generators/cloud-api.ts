// Emits a per-device OpenAPI specification for the cloud REST contract. Because the
// telemetry metrics, shadow schema, and command modes are all derived from the manifest,
// the cloud, firmware, and any client describe the same device by construction, which is
// what keeps the cloud contract from drifting away from the device definition.

import type { ActuatorCapability, DeviceIR, SensorCapability } from "../schema.js";
import type { GeneratedFile, Generator } from "./index.js";

function sensors(ir: DeviceIR): SensorCapability[] {
  return ir.capabilities.filter((cap): cap is SensorCapability => cap.kind === "sensor");
}

function actuators(ir: DeviceIR): ActuatorCapability[] {
  return ir.capabilities.filter((cap): cap is ActuatorCapability => cap.kind === "actuator");
}

function stringSchema(values: string[]): Record<string, unknown> {
  return values.length > 0 ? { type: "string", enum: values } : { type: "string" };
}

function shadowSchema(ir: DeviceIR): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const sensor of sensors(ir)) {
    properties[sensor.key] = {
      type: "object",
      properties: {
        value: { type: "number" },
        unit: sensor.unit !== null ? { type: "string", const: sensor.unit } : { type: "string" },
        updatedAt: { type: "integer" },
      },
      required: ["value", "unit", "updatedAt"],
    };
  }
  return { type: "object", properties };
}

export const cloudApiGenerator: Generator = {
  name: "cloud-api",
  generate(ir: DeviceIR): GeneratedFile[] {
    const sensorKeys = sensors(ir).map((sensor) => sensor.key);
    const commandNames = actuators(ir).map((actuator) => `set_${actuator.key}_mode`);
    const modes = [...new Set(actuators(ir).flatMap((actuator) => actuator.modes))];

    const spec = {
      openapi: "3.1.0",
      info: {
        title: `${ir.device.name} cloud API`,
        version: "0.1.0",
        description: `Generated from the ${ir.device.name} device manifest.`,
      },
      paths: {
        "/devices/{deviceId}/telemetry": {
          post: {
            summary: "Ingest telemetry samples",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TelemetryBatch" },
                },
              },
            },
            responses: { "202": { description: "Accepted" } },
          },
        },
        "/devices/{deviceId}/shadow": {
          get: {
            summary: "Fetch the device shadow",
            responses: {
              "200": {
                description: "Latest reported values",
                content: {
                  "application/json": { schema: { $ref: "#/components/schemas/DeviceShadow" } },
                },
              },
            },
          },
        },
        "/devices/{deviceId}/commands": {
          post: {
            summary: "Queue a command",
            requestBody: {
              required: true,
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Command" } },
              },
            },
            responses: { "201": { description: "Command queued" } },
          },
        },
      },
      components: {
        schemas: {
          TelemetrySample: {
            type: "object",
            properties: {
              metric: stringSchema(sensorKeys),
              value: { type: "number" },
              unit: { type: "string" },
            },
            required: ["metric", "value", "unit"],
          },
          TelemetryBatch: {
            type: "object",
            properties: {
              samples: { type: "array", items: { $ref: "#/components/schemas/TelemetrySample" } },
            },
            required: ["samples"],
          },
          DeviceShadow: shadowSchema(ir),
          Command: {
            type: "object",
            properties: {
              name: stringSchema(commandNames),
              args: {
                type: "object",
                properties: { mode: stringSchema(modes) },
              },
            },
            required: ["name"],
          },
        },
      },
    };

    return [{ path: `cloud/${ir.device.name}.openapi.json`, contents: `${JSON.stringify(spec, null, 2)}\n` }];
  },
};
