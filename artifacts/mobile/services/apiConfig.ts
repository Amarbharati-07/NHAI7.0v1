import Constants from "expo-constants";
import {
  friendlyErrorMessage,
  friendlyConnectionMessage,
  friendlyDeleteMessage,
  friendlyLoadMessage,
  friendlySaveMessage,
  friendlySessionMessage,
  friendlyUpdateMessage,
  friendlyBackendUnreachableMessage,
  friendlyDatabaseUnavailableMessage,
  isDatabaseUnavailableResponse,
  isTechnicalErrorMessage,
} from "@/services/userMessages";

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

const API_PORT = 3000;
const API_BASE_TIMEOUT_MS = 3500;

let cachedApiBase: string | null = null;
let cachedApiConfigKey: string | null = null;
let resolvingApiBase: Promise<string> | null = null;
let didLogRuntimeConfig = false;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

function normalizeApiBase(raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  return trimTrailingSlash(withProtocol);
}

function getRuntimeApiConfig(): { apiUrl: string; domain: string } {
  const apiUrl = process.env["EXPO_PUBLIC_API_URL"]?.trim() ?? "";
  const domain = process.env["EXPO_PUBLIC_DOMAIN"]?.trim() ?? "";

  if (typeof __DEV__ !== "undefined" && __DEV__ && !didLogRuntimeConfig) {
    didLogRuntimeConfig = true;
    console.info("[api] runtime config", {
      apiUrl: apiUrl || "(unset)",
      domain: domain || "(unset)",
    });
  }

  return { apiUrl, domain };
}

function getRuntimeApiConfigKey(): string {
  const { apiUrl, domain } = getRuntimeApiConfig();
  const expoHost = getExpoHostCandidates().join("|");
  return [apiUrl, domain, expoHost].join("::");
}

function buildApiBaseFromHost(host: string): string {
  const cleaned = host.trim();
  if (!cleaned) return `http://localhost:${API_PORT}/api`;
  const url = /^https?:\/\//i.test(cleaned) ? new URL(cleaned) : new URL(`http://${cleaned}`);
  const hostname = url.hostname;
  const port = url.port && url.port !== "8081" && url.port !== "8082" ? url.port : String(API_PORT);
  const protocol = isLocalHost(hostname) ? "http" : "https";
  return `${protocol}://${hostname}:${port}/api`;
}

function getExpoHostCandidates(): string[] {
  const expoAny = Constants as any;
  const candidates: string[] = [];
  const rawHost =
    expoAny?.expoConfig?.hostUri ??
    expoAny?.expoGoConfig?.hostUri ??
    expoAny?.manifest2?.extra?.expoClient?.hostUri ??
    expoAny?.manifest?.debuggerHost ??
    expoAny?.manifest?.hostUri ??
    "";

  if (rawHost) {
    candidates.push(buildApiBaseFromHost(String(rawHost)));
  }
  return candidates;
}

function getConfiguredBaseCandidates(): string[] {
  const candidates: string[] = [];
  const { apiUrl: envBase, domain } = getRuntimeApiConfig();
  const expoHosts = getExpoHostCandidates();

  // In dev, Metro's LAN host (192.168.x.x) is usually correct; .env often has a stale IP.
  if (typeof __DEV__ !== "undefined" && __DEV__ && expoHosts.length > 0) {
    candidates.push(...expoHosts);
  }

  if (envBase) {
    candidates.push(normalizeApiBase(envBase));
  }

  if (domain) {
    if (/^https?:\/\//i.test(domain)) {
      candidates.push(trimTrailingSlash(domain));
    } else if (domain.includes(":")) {
      candidates.push(trimTrailingSlash(`http://${domain}`));
    } else {
      candidates.push(buildApiBaseFromHost(domain));
    }
  }

  if (!(typeof __DEV__ !== "undefined" && __DEV__)) {
    candidates.push(...expoHosts);
  }

  candidates.push(`http://localhost:${API_PORT}/api`);
  candidates.push(`http://127.0.0.1:${API_PORT}/api`);

  return [...new Set(candidates.filter(Boolean))];
}

export function getApiBase(): string {
  const { apiUrl, domain } = getRuntimeApiConfig();
  if (apiUrl) return normalizeApiBase(apiUrl);
  if (domain) {
    if (/^https?:\/\//i.test(domain)) return trimTrailingSlash(domain);
    if (domain.includes(":")) return `http://${domain}`;
    return buildApiBaseFromHost(domain);
  }
  const expoCandidates = getExpoHostCandidates();
  if (expoCandidates.length > 0) return expoCandidates[0];
  return `http://localhost:${API_PORT}/api`;
}

/** True when the app is configured to use a real backend (not demo-only mode). */
export function isApiConfigured(): boolean {
  const { apiUrl, domain } = getRuntimeApiConfig();
  return Boolean(apiUrl || domain || getExpoHostCandidates().length > 0);
}

async function probeApiBase(base: string): Promise<boolean> {
  const normalized = trimTrailingSlash(base);
  try {
    const res = await apiFetch(`${normalized}/health`, { headers: getAdminHeaders() }, API_BASE_TIMEOUT_MS);
    if (!res.ok) return false;
    const body = (await res.json().catch(() => ({}))) as { status?: string };
    return body.status === "ok";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.info("[api] base probe failed", { base: normalized, error: msg });
    return false;
  }
}

export async function resolveApiBase(forceRefresh = false): Promise<string> {
  const currentConfigKey = getRuntimeApiConfigKey();
  const cacheIsFresh = cachedApiBase && cachedApiConfigKey === currentConfigKey;
  if (!forceRefresh && cacheIsFresh) return cachedApiBase!;
  if (!forceRefresh && resolvingApiBase) return resolvingApiBase;

  const run = (async () => {
    const candidates = getConfiguredBaseCandidates();
    const { apiUrl } = getRuntimeApiConfig();
    console.info("[api] resolving base", {
      envApiUrl: apiUrl || "(unset)",
      expoHosts: getExpoHostCandidates(),
      candidates,
    });

    for (const candidate of candidates) {
      if (await probeApiBase(candidate)) {
        cachedApiBase = candidate;
        cachedApiConfigKey = currentConfigKey;
        if (apiUrl && normalizeApiBase(apiUrl) !== candidate) {
          console.warn("[api] EXPO_PUBLIC_API_URL unreachable — using working base instead", {
            configured: normalizeApiBase(apiUrl),
            resolved: candidate,
          });
        } else {
          console.info("[api] resolved base", { base: candidate });
        }
        return candidate;
      }
    }

    const fallback = candidates[0] ?? getApiBase();
    cachedApiBase = fallback;
    cachedApiConfigKey = currentConfigKey;
    console.warn("[api] no healthy base found — is the API running? (pnpm --filter @workspace/api-server run dev)", {
      base: fallback,
      tried: candidates,
    });
    return fallback;
  })();

  resolvingApiBase = run;
  return run.finally(() => {
    resolvingApiBase = null;
  });
}

const ADMIN_TIMEOUT_MS = 12000;

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function apiFetch(
  url: string,
  init?: RequestInit,
  timeoutMs = ADMIN_TIMEOUT_MS,
): Promise<Response> {
  const signal = init?.signal ?? createRequestSignal(timeoutMs);
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    const method = (init?.method ?? "GET").toUpperCase();
    const requestBody =
      typeof init?.body === "string"
        ? init.body
        : init?.body
          ? "[non-string body]"
          : undefined;
    console.info("[api] request", {
      method,
      url,
      timeoutMs,
      body: requestBody,
    });
  }

  try {
    const response = await fetch(url, { ...init, signal });
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      const responseBody = await response
        .clone()
        .text()
        .catch(() => "");
      console.info("[api] response", {
        method: (init?.method ?? "GET").toUpperCase(),
        url,
        status: response.status,
        body: responseBody || "(empty)",
      });
    }
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.info("[api] error", {
        method: (init?.method ?? "GET").toUpperCase(),
        url,
        error: message,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    const wrapped = new Error(`${(init?.method ?? "GET").toUpperCase()} ${url} failed: ${message}`);
    (wrapped as any).cause = error;
    throw wrapped;
  }
}

/** Headers for /api/admin/* routes (optional bearer key must match server ADMIN_API_KEY). */
export function getAdminHeaders(includeJson = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJson) headers["Content-Type"] = "application/json";
  const apiKey = process.env["EXPO_PUBLIC_ADMIN_API_KEY"];
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  return headers;
}

function isAbortOrTimeoutError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const lower = raw.toLowerCase();
  return lower.includes("aborted") || lower.includes("timed out") || lower.includes("timeout");
}

function isBackendUnreachableError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const lower = raw.toLowerCase();
  return (
    lower.includes("network request failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("no healthy base found")
  );
}

function classifyFetchFailure(_base: string, err: unknown): string {
  if (isBackendUnreachableError(err)) return friendlyBackendUnreachableMessage();
  if (isAbortOrTimeoutError(err)) return friendlyDatabaseUnavailableMessage();
  if (err instanceof Error && err.message && !isTechnicalErrorMessage(err.message)) {
    return err.message;
  }
  return friendlyConnectionMessage();
}

function networkError(base: string, err: unknown): string {
  return classifyFetchFailure(base, err);
}

export async function checkApiHealth(): Promise<boolean> {
  const base = await resolveApiBase();
  try {
    const res = await apiFetch(`${base}/health`, { headers: getAdminHeaders() }, 8000);
    if (!res.ok) return false;
    const body = (await res.json().catch(() => ({}))) as { status?: string };
    return body.status === "ok";
  } catch {
    return false;
  }
}

export type ApiDatabaseReadyResult =
  | { ok: true }
  | { ok: false; reason: "backend_unreachable" | "database_unavailable"; message: string };

/** True when API process is up AND PostgreSQL answers (required for admin mutations). */
export async function checkApiDatabaseReady(): Promise<ApiDatabaseReadyResult> {
  const base = await resolveApiBase();
  try {
    const res = await apiFetch(`${base}/health/ready`, { headers: getAdminHeaders() }, 8_000);
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { database?: string };
      if (body.database === "ok") return { ok: true };
    }
    const body = (await res.json().catch(() => ({}))) as { database?: string; detail?: string };
    if (res.status === 404) {
      return {
        ok: false,
        reason: "database_unavailable",
        message:
          "API is outdated. On your Mac run: pnpm run kill:api && pnpm run dev:api (rebuilds server with database health check).",
      };
    }
    return {
      ok: false,
      reason: "database_unavailable",
      message: friendlyDatabaseUnavailableMessage(),
    };
  } catch (err) {
    if (isBackendUnreachableError(err)) {
      return { ok: false, reason: "backend_unreachable", message: friendlyBackendUnreachableMessage() };
    }
    if (isAbortOrTimeoutError(err)) {
      return { ok: false, reason: "database_unavailable", message: friendlyDatabaseUnavailableMessage() };
    }
    return { ok: false, reason: "backend_unreachable", message: friendlyBackendUnreachableMessage() };
  }
}

export async function assertApiDatabaseReady(): Promise<void> {
  const ready = await checkApiDatabaseReady();
  if (!ready.ok) throw new Error(ready.message);
}

export async function apiGetJson<T>(path: string, timeoutMs = ADMIN_TIMEOUT_MS): Promise<T> {
  const base = await resolveApiBase();
  try {
    const res = await apiFetch(`${base}/${path}`, { headers: getAdminHeaders() }, timeoutMs);
    if (!res.ok) {
      const bodyText = await res.clone().text().catch(() => "");
      const body = safeParseResponseBody(bodyText) as { error?: string };
      if (res.status === 401) {
        throw new Error(friendlySessionMessage());
      }
      if (res.status === 503 && isDatabaseUnavailableResponse(body)) {
        throw new Error(friendlyDatabaseUnavailableMessage());
      }
      throw new Error(
        body.error
          ? friendlyErrorMessage(body.error, friendlyLoadMessage())
          : bodyText.trim() || friendlyLoadMessage(),
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && !isTechnicalErrorMessage(err.message)) throw err;
    throw new Error(networkError(base, err));
  }
}

export async function apiPostJson<T>(path: string, body: object, timeoutMs = ADMIN_TIMEOUT_MS): Promise<T> {
  const base = await resolveApiBase();
  try {
    const res = await apiFetch(`${base}/${path}`, {
      method: "POST",
      headers: getAdminHeaders(true),
      body: JSON.stringify(body),
    }, timeoutMs);
    if (!res.ok) {
      const bodyText = await res.clone().text().catch(() => "");
      const data = safeParseResponseBody(bodyText) as { error?: string; message?: string };
      if (res.status === 401) {
        throw new Error(friendlySessionMessage());
      }
      if (res.status === 503 && isDatabaseUnavailableResponse(data)) {
        throw new Error(
          typeof data.message === "string" && data.message.trim()
            ? friendlyErrorMessage(data.message, friendlyDatabaseUnavailableMessage())
            : friendlyDatabaseUnavailableMessage(),
        );
      }
      throw new Error(
        data.error
          ? friendlyErrorMessage(data.error, friendlySaveMessage())
          : typeof data.message === "string" && data.message.trim()
            ? friendlyErrorMessage(data.message, friendlySaveMessage())
            : bodyText.trim() || friendlySaveMessage(),
      );
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && !isTechnicalErrorMessage(err.message)) throw err;
    throw new Error(networkError(base, err));
  }
}

export async function apiPutJson<T = unknown>(path: string, body: object, timeoutMs = ADMIN_TIMEOUT_MS): Promise<T | void> {
  const base = await resolveApiBase();
  try {
    const res = await apiFetch(`${base}/${path}`, {
      method: "PUT",
      headers: getAdminHeaders(true),
      body: JSON.stringify(body),
    }, timeoutMs);
    if (!res.ok) {
      const bodyText = await res.clone().text().catch(() => "");
      const data = safeParseResponseBody(bodyText) as { error?: string };
      if (res.status === 401) {
        throw new Error(friendlySessionMessage());
      }
      throw new Error(
        data.error
          ? friendlyErrorMessage(data.error, friendlyUpdateMessage())
          : bodyText.trim() || friendlyUpdateMessage(),
      );
    }
    const bodyText = await res.text().catch(() => "");
    if (!bodyText.trim()) return;
    return safeParseResponseBody(bodyText) as T;
  } catch (err) {
    if (err instanceof Error && !isTechnicalErrorMessage(err.message)) throw err;
    throw new Error(networkError(base, err));
  }
}

export type ApiMutationResult =
  | { ok: true; status: number }
  | { ok: false; status: number; error: string };

export async function apiDeletePath(path: string, timeoutMs = ADMIN_TIMEOUT_MS): Promise<ApiMutationResult> {
  const base = await resolveApiBase();
  try {
    const res = await apiFetch(
      `${base}/${path}`,
      { method: "DELETE", headers: getAdminHeaders() },
      timeoutMs,
    );
    if (res.ok || res.status === 404) {
      return { ok: true, status: res.status };
    }
    const bodyText = await res.clone().text().catch(() => "");
    const body = safeParseResponseBody(bodyText) as { error?: string };
    if (res.status === 401) {
      return {
        ok: false,
        status: 401,
        error: friendlySessionMessage(),
      };
    }
    return {
      ok: false,
      status: res.status,
      error: body.error
        ? friendlyErrorMessage(body.error, friendlyDeleteMessage())
        : bodyText.trim() || friendlyDeleteMessage(),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: networkError(base, err),
    };
  }
}

function safeParseResponseBody(bodyText: string): unknown {
  const trimmed = bodyText.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    return { error: trimmed };
  }
}

export function clearResolvedApiBase(): void {
  cachedApiBase = null;
  cachedApiConfigKey = null;
}
