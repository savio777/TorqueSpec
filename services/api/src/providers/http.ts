export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly status?: number,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
  }
}

export async function postJson<T>(
  provider: string,
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  timeoutMs = 60_000,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new ProviderError(provider, `falha de rede: ${(error as Error).message}`);
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    throw new ProviderError(provider, `HTTP ${response.status}: ${detail}`, response.status);
  }
  return (await response.json()) as T;
}
