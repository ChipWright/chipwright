// Shared plumbing for the HTTP provider adapters. Providers use the global fetch so the
// package carries no runtime dependencies. Errors never include request headers, so an API
// key can never leak into an error message or a log.

export class ProviderError extends Error {}

interface JsonResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

// POSTs a JSON body and returns the parsed JSON response, or throws ProviderError with a
// message that describes the failure without echoing any credentials.
export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  let response: JsonResponse;
  try {
    response = (await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    })) as unknown as JsonResponse;
  } catch (error) {
    throw new ProviderError(`request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ProviderError(`provider responded ${response.status}: ${detail.slice(0, 500)}`);
  }
  return response.json();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
