/** Request timeout compatible with React Native (AbortSignal.timeout is not always available). */
export function createRequestSignal(timeoutMs: number): AbortSignal {
  if (
    typeof AbortSignal !== "undefined" &&
    "timeout" in AbortSignal &&
    typeof AbortSignal.timeout === "function"
  ) {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

export function getApiBase(): string {
  if (process.env["EXPO_PUBLIC_API_URL"]) return process.env["EXPO_PUBLIC_API_URL"]!;
  const domain = process.env["EXPO_PUBLIC_DOMAIN"];
  if (domain) return `https://${domain}:3000/api`;
  return "http://localhost:3000/api";
}

/** True when the app is configured to use a real backend (not demo-only mode). */
export function isApiConfigured(): boolean {
  return Boolean(process.env["EXPO_PUBLIC_API_URL"]?.trim());
}

const ADMIN_TIMEOUT_MS = 25000;

export async function apiFetch(
  url: string,
  init?: RequestInit,
  timeoutMs = ADMIN_TIMEOUT_MS,
): Promise<Response> {
  const signal = init?.signal ?? createRequestSignal(timeoutMs);
  return fetch(url, { ...init, signal });
}

/** Headers for /api/admin/* routes (optional bearer key must match server ADMIN_API_KEY). */
export function getAdminHeaders(includeJson = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJson) headers["Content-Type"] = "application/json";
  const apiKey = process.env["EXPO_PUBLIC_ADMIN_API_KEY"];
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  return headers;
}

function networkError(base: string, err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "AbortError") {
    return `API timed out. Ensure the server is running at ${base} and your phone is on the same Wi‑Fi.`;
  }
  return `Cannot reach API at ${base}. Run: pnpm --filter @workspace/api-server run dev`;
}

export async function checkApiHealth(): Promise<boolean> {
  const base = getApiBase();
  try {
    const res = await apiFetch(`${base}/healthz`, { headers: getAdminHeaders() }, 8000);
    if (!res.ok) return false;
    const body = (await res.json().catch(() => ({}))) as { status?: string };
    return body.status === "ok";
  } catch {
    return false;
  }
}

export async function apiGetJson<T>(path: string): Promise<T> {
  const base = getApiBase();
  try {
    const res = await apiFetch(`${base}/${path}`, { headers: getAdminHeaders() });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401) {
        throw new Error(
          "API unauthorized (401). Set EXPO_PUBLIC_ADMIN_API_KEY to match ADMIN_API_KEY on the server.",
        );
      }
      throw new Error(body.error ?? `Request failed (HTTP ${res.status})`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.message.includes("API ")) throw err;
    throw new Error(networkError(base, err));
  }
}

export async function apiPostJson<T>(path: string, body: object): Promise<T> {
  const base = getApiBase();
  try {
    const res = await apiFetch(`${base}/${path}`, {
      method: "POST",
      headers: getAdminHeaders(true),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401) {
        throw new Error(
          "API unauthorized (401). Set EXPO_PUBLIC_ADMIN_API_KEY to match ADMIN_API_KEY on the server.",
        );
      }
      throw new Error(data.error ?? `Save failed (HTTP ${res.status})`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && (err.message.includes("API ") || err.message.includes("Save failed"))) {
      throw err;
    }
    throw new Error(networkError(base, err));
  }
}

export async function apiPutJson(path: string, body: object): Promise<void> {
  const base = getApiBase();
  try {
    const res = await apiFetch(`${base}/${path}`, {
      method: "PUT",
      headers: getAdminHeaders(true),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401) {
        throw new Error(
          "API unauthorized (401). Set EXPO_PUBLIC_ADMIN_API_KEY to match ADMIN_API_KEY on the server.",
        );
      }
      throw new Error(data.error ?? `Update failed (HTTP ${res.status})`);
    }
  } catch (err) {
    if (err instanceof Error && (err.message.includes("API ") || err.message.includes("Update failed"))) {
      throw err;
    }
    throw new Error(networkError(base, err));
  }
}

export type ApiMutationResult =
  | { ok: true; status: number }
  | { ok: false; status: number; error: string };

export async function apiDeletePath(path: string, timeoutMs = ADMIN_TIMEOUT_MS): Promise<ApiMutationResult> {
  const base = getApiBase();
  try {
    const res = await apiFetch(
      `${base}/${path}`,
      { method: "DELETE", headers: getAdminHeaders() },
      timeoutMs,
    );
    if (res.ok || res.status === 404) {
      return { ok: true, status: res.status };
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 401) {
      return {
        ok: false,
        status: 401,
        error:
          "API rejected the request (401). Set EXPO_PUBLIC_ADMIN_API_KEY in mobile .env to match ADMIN_API_KEY on the server.",
      };
    }
    return {
      ok: false,
      status: res.status,
      error: body.error ?? `Delete failed (HTTP ${res.status})`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: networkError(base, err),
    };
  }
}
