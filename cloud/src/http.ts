// A thin HTTP API over CloudService, built on the Node standard library so the cloud has
// no runtime dependencies. Routes:
//
//   POST /devices                     register a device
//   GET  /devices                     list devices
//   GET  /devices/:id                 fetch a device record
//   POST /devices/:id/telemetry       ingest telemetry samples
//   GET  /devices/:id/shadow          fetch the device shadow
//   POST /devices/:id/commands        queue a command
//   GET  /devices/:id/commands        drain queued commands

import { createServer, type IncomingMessage, type Server } from "node:http";
import type { RolloutOptions } from "./ota.js";
import type { RegisterDeviceInput } from "./registry.js";
import type { CloudService } from "./service.js";
import type { TelemetrySample } from "./shadow.js";
import type { SignedBuild } from "./signing.js";

interface JsonResponse {
  status: number;
  body: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) {
    return undefined;
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text.length === 0 ? undefined : JSON.parse(text);
}

function parseSamples(value: unknown): TelemetrySample[] | null {
  if (!isRecord(value) || !Array.isArray(value["samples"])) {
    return null;
  }
  const samples: TelemetrySample[] = [];
  for (const raw of value["samples"]) {
    if (
      !isRecord(raw) ||
      typeof raw["metric"] !== "string" ||
      typeof raw["value"] !== "number" ||
      typeof raw["unit"] !== "string"
    ) {
      return null;
    }
    samples.push({ metric: raw["metric"], value: raw["value"], unit: raw["unit"] });
  }
  return samples;
}

async function routeDevicesRoot(service: CloudService, req: IncomingMessage): Promise<JsonResponse> {
  if (req.method === "GET") {
    return { status: 200, body: service.registry.list() };
  }
  if (req.method === "POST") {
    const body = await readJson(req);
    if (!isRecord(body) || typeof body["deviceId"] !== "string" || typeof body["deviceType"] !== "string") {
      return { status: 400, body: { error: "deviceId and deviceType are required" } };
    }
    const input: RegisterDeviceInput = { deviceId: body["deviceId"], deviceType: body["deviceType"] };
    if (typeof body["firmwareVersion"] === "string") {
      input.firmwareVersion = body["firmwareVersion"];
    }
    try {
      return { status: 201, body: service.registerDevice(input) };
    } catch (error) {
      return { status: 409, body: { error: (error as Error).message } };
    }
  }
  return { status: 405, body: { error: "method not allowed" } };
}

async function routeDevice(
  service: CloudService,
  req: IncomingMessage,
  deviceId: string,
  sub: string | undefined,
): Promise<JsonResponse> {
  if (sub === undefined && req.method === "GET") {
    const record = service.registry.get(deviceId);
    return record !== undefined
      ? { status: 200, body: record }
      : { status: 404, body: { error: "device not found" } };
  }

  if (sub === "telemetry" && req.method === "POST") {
    const samples = parseSamples(await readJson(req));
    if (samples === null) {
      return { status: 400, body: { error: "each sample needs metric, value, and unit" } };
    }
    try {
      service.ingestTelemetry(deviceId, samples);
      return { status: 202, body: { accepted: samples.length } };
    } catch (error) {
      return { status: 404, body: { error: (error as Error).message } };
    }
  }

  if (sub === "shadow" && req.method === "GET") {
    const shadow = service.getShadow(deviceId);
    return shadow !== undefined
      ? { status: 200, body: shadow }
      : { status: 404, body: { error: "no shadow for device" } };
  }

  if (sub === "commands" && req.method === "POST") {
    const body = await readJson(req);
    if (!isRecord(body) || typeof body["name"] !== "string") {
      return { status: 400, body: { error: "command name is required" } };
    }
    const args = isRecord(body["args"]) ? body["args"] : {};
    try {
      return { status: 201, body: service.sendCommand(deviceId, body["name"], args) };
    } catch (error) {
      return { status: 404, body: { error: (error as Error).message } };
    }
  }

  if (sub === "commands" && req.method === "GET") {
    return { status: 200, body: service.drainCommands(deviceId) };
  }

  return { status: 404, body: { error: "unknown route" } };
}

async function routeProvision(service: CloudService, req: IncomingMessage): Promise<JsonResponse> {
  const body = await readJson(req);
  if (!isRecord(body) || typeof body["deviceId"] !== "string" || typeof body["deviceType"] !== "string") {
    return { status: 400, body: { error: "deviceId and deviceType are required" } };
  }
  const input: RegisterDeviceInput = { deviceId: body["deviceId"], deviceType: body["deviceType"] };
  if (typeof body["firmwareVersion"] === "string") {
    input.firmwareVersion = body["firmwareVersion"];
  }
  try {
    return { status: 201, body: service.provisionDevice(input) };
  } catch (error) {
    return { status: 409, body: { error: (error as Error).message } };
  }
}

async function routeFirmware(
  service: CloudService,
  req: IncomingMessage,
  parts: string[],
): Promise<JsonResponse> {
  if (parts.length === 1 && req.method === "POST") {
    const body = await readJson(req);
    const rawBuild = isRecord(body) ? body["build"] : undefined;
    if (!isRecord(body) || !isRecord(rawBuild) || typeof body["artifactBase64"] !== "string") {
      return { status: 400, body: { error: "build and artifactBase64 are required" } };
    }
    if (
      typeof rawBuild["deviceType"] !== "string" ||
      typeof rawBuild["version"] !== "string" ||
      typeof rawBuild["artifactSha256"] !== "string" ||
      typeof rawBuild["signature"] !== "string"
    ) {
      return { status: 400, body: { error: "malformed build manifest" } };
    }
    const build: SignedBuild = {
      deviceType: rawBuild["deviceType"],
      version: rawBuild["version"],
      artifactSha256: rawBuild["artifactSha256"],
      signature: rawBuild["signature"],
    };
    try {
      service.publishFirmware(build, Buffer.from(body["artifactBase64"], "base64"));
      return { status: 201, body: { published: `${build.deviceType}@${build.version}` } };
    } catch (error) {
      return { status: 400, body: { error: (error as Error).message } };
    }
  }
  if (parts.length === 3 && req.method === "GET") {
    const build = service.getFirmware(parts[1] as string, parts[2] as string);
    return build !== undefined
      ? { status: 200, body: build }
      : { status: 404, body: { error: "no such firmware" } };
  }
  return { status: 404, body: { error: "unknown route" } };
}

async function routeRollouts(
  service: CloudService,
  req: IncomingMessage,
  parts: string[],
): Promise<JsonResponse> {
  if (parts.length === 1 && req.method === "POST") {
    const body = await readJson(req);
    if (!isRecord(body) || !Array.isArray(body["deviceIds"]) || typeof body["targetVersion"] !== "string") {
      return { status: 400, body: { error: "deviceIds and targetVersion are required" } };
    }
    const deviceIds: string[] = [];
    for (const entry of body["deviceIds"]) {
      if (typeof entry !== "string") {
        return { status: 400, body: { error: "deviceIds must be strings" } };
      }
      deviceIds.push(entry);
    }
    const options: RolloutOptions = {};
    if (typeof body["batchSize"] === "number") {
      options.batchSize = body["batchSize"];
    }
    if (typeof body["maxFailures"] === "number") {
      options.maxFailures = body["maxFailures"];
    }
    return { status: 201, body: service.createRollout(deviceIds, body["targetVersion"], options) };
  }

  const rolloutId = parts[1];
  if (rolloutId === undefined) {
    return { status: 404, body: { error: "unknown route" } };
  }

  try {
    if (parts.length === 2 && req.method === "GET") {
      return { status: 200, body: service.rolloutStatus(rolloutId) };
    }
    if (parts.length === 3 && parts[2] === "next-batch" && req.method === "POST") {
      return { status: 200, body: service.advanceRollout(rolloutId) };
    }
    if (parts.length === 3 && parts[2] === "report" && req.method === "POST") {
      const body = await readJson(req);
      if (
        !isRecord(body) ||
        typeof body["deviceId"] !== "string" ||
        (body["outcome"] !== "applied" && body["outcome"] !== "failed")
      ) {
        return { status: 400, body: { error: "deviceId and outcome (applied or failed) are required" } };
      }
      return { status: 200, body: service.reportRollout(rolloutId, body["deviceId"], body["outcome"]) };
    }
  } catch (error) {
    return { status: 404, body: { error: (error as Error).message } };
  }
  return { status: 404, body: { error: "unknown route" } };
}

async function route(service: CloudService, req: IncomingMessage): Promise<JsonResponse> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter((part) => part.length > 0);

  if (parts.length === 1 && parts[0] === "ca" && req.method === "GET") {
    return { status: 200, body: { caPublicKeyPem: service.caPublicKeyPem } };
  }
  if (parts.length === 1 && parts[0] === "provision" && req.method === "POST") {
    return routeProvision(service, req);
  }
  if (parts[0] === "firmware") {
    return routeFirmware(service, req, parts);
  }
  if (parts[0] === "rollouts") {
    return routeRollouts(service, req, parts);
  }
  if (parts.length === 1 && parts[0] === "devices") {
    return routeDevicesRoot(service, req);
  }
  if (parts.length >= 2 && parts[0] === "devices") {
    return routeDevice(service, req, parts[1] as string, parts[2]);
  }
  return { status: 404, body: { error: "unknown route" } };
}

export function createCloudServer(service: CloudService): Server {
  return createServer((req, res) => {
    route(service, req)
      .then((result) => {
        res.writeHead(result.status, { "content-type": "application/json" });
        res.end(JSON.stringify(result.body ?? null));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "internal error";
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: message }));
      });
  });
}
