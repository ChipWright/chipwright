// A thin HTTP API over PackageRegistry, built on the Node standard library so the
// registry service has no runtime dependencies. It is the networked form of the same
// registry the CLI uses locally; a client fetches signed packages over it and re-verifies
// them exactly as it would from disk. Routes:
//
//   GET  /packages                 list or search packages (optional ?q=)
//   GET  /packages/:name           a name's versions and its latest version
//   GET  /packages/:name/:version  a signed package (version may be "latest")
//   POST /packages                 publish a signed package

import { createServer, type IncomingMessage, type Server } from "node:http";
import { PackageRegistry, PublishError } from "./registry.js";
import { parseSignedPackage } from "./wire.js";

interface JsonResponse {
  status: number;
  body: unknown;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text.length === 0 ? undefined : JSON.parse(text);
}

function publish(registry: PackageRegistry, body: unknown): JsonResponse {
  const signed = parseSignedPackage(body);
  if (signed === null) {
    return { status: 400, body: { error: "malformed signed package" } };
  }
  try {
    registry.publish(signed);
    return {
      status: 201,
      body: { published: `${signed.pkg.meta.name}@${signed.pkg.meta.version}` },
    };
  } catch (error) {
    if (error instanceof PublishError) {
      const conflict = error.message.includes("already published");
      return { status: conflict ? 409 : 400, body: { error: error.message } };
    }
    throw error;
  }
}

function getName(registry: PackageRegistry, name: string): JsonResponse {
  const versions = registry.versions(name);
  if (versions.length === 0) {
    return { status: 404, body: { error: `no package named "${name}"` } };
  }
  return { status: 200, body: { name, versions, latest: registry.latest(name) } };
}

function getVersion(registry: PackageRegistry, name: string, version: string): JsonResponse {
  const signed = version === "latest" ? registry.resolve(name) : registry.get(name, version);
  return signed !== undefined
    ? { status: 200, body: signed }
    : { status: 404, body: { error: `no package matches "${name}@${version}"` } };
}

async function route(registry: PackageRegistry, req: IncomingMessage): Promise<JsonResponse> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter((part) => part.length > 0);

  if (parts[0] !== "packages") {
    return { status: 404, body: { error: "unknown route" } };
  }

  if (parts.length === 1) {
    if (req.method === "GET") {
      return { status: 200, body: registry.search(url.searchParams.get("q") ?? "") };
    }
    if (req.method === "POST") {
      return publish(registry, await readJson(req));
    }
    return { status: 405, body: { error: "method not allowed" } };
  }

  const name = parts[1] as string;
  if (parts.length === 2 && req.method === "GET") {
    return getName(registry, name);
  }
  if (parts.length === 3 && req.method === "GET") {
    return getVersion(registry, name, parts[2] as string);
  }
  return { status: 404, body: { error: "unknown route" } };
}

export function createRegistryServer(registry: PackageRegistry): Server {
  return createServer((req, res) => {
    route(registry, req)
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
