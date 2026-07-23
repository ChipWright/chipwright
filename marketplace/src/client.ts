// A client for a remote registry service. It speaks the HTTP API in http.ts and returns
// the same types the in-process registry does, so install re-verifies a fetched package
// exactly as it would a local one. Uses the global fetch available on the supported Node
// versions, keeping the package free of runtime dependencies.

import { type PackageMeta } from "./package.js";
import { type SignedPackage } from "./signing.js";
import { parseSignedPackage } from "./wire.js";

export class RegistryClientError extends Error {}

export interface NameInfo {
  name: string;
  versions: string[];
  latest: string | undefined;
}

export class RegistryClient {
  constructor(private readonly baseUrl: string) {}

  private url(path: string): string {
    return new URL(path, this.baseUrl).toString();
  }

  async publish(signed: SignedPackage): Promise<void> {
    const response = await fetch(this.url("/packages"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(signed),
    });
    if (!response.ok) {
      throw new RegistryClientError(await errorMessage(response));
    }
  }

  async search(query: string): Promise<PackageMeta[]> {
    const response = await fetch(this.url(`/packages?q=${encodeURIComponent(query)}`));
    if (!response.ok) {
      throw new RegistryClientError(await errorMessage(response));
    }
    return (await response.json()) as PackageMeta[];
  }

  async info(name: string): Promise<NameInfo | undefined> {
    const response = await fetch(this.url(`/packages/${encodeURIComponent(name)}`));
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new RegistryClientError(await errorMessage(response));
    }
    return (await response.json()) as NameInfo;
  }

  // Resolves a specifier of the form "name" or "name@version" to a signed package,
  // returning undefined if it does not exist. A bare name resolves to the latest version.
  async resolve(spec: string): Promise<SignedPackage | undefined> {
    const at = spec.lastIndexOf("@");
    const name = at > 0 ? spec.slice(0, at) : spec;
    const version = at > 0 ? spec.slice(at + 1) : "latest";
    const response = await fetch(
      this.url(`/packages/${encodeURIComponent(name)}/${encodeURIComponent(version)}`),
    );
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new RegistryClientError(await errorMessage(response));
    }
    const signed = parseSignedPackage(await response.json());
    if (signed === null) {
      throw new RegistryClientError("registry returned a malformed package");
    }
    return signed;
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Fall through to the status text when the body is not the expected JSON.
  }
  return `registry responded ${response.status}`;
}
