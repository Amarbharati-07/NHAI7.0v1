const DEFAULT_GENERIC_ERROR = "Something went wrong. Please try again.";
const DEFAULT_LOAD_ERROR = "Unable to load data. Please try again.";
const DEFAULT_SAVE_ERROR = "Unable to save changes. Please try again.";
const DEFAULT_UPDATE_ERROR = "Unable to update changes. Please try again.";
const DEFAULT_DELETE_ERROR = "Unable to delete this item. Please try again.";
const DEFAULT_CONNECTION_ERROR = "Unable to connect. Please check your internet connection and try again.";
const BACKEND_UNREACHABLE_MESSAGE =
  "Backend server unreachable. On your Mac run pnpm run dev:api (must show Server listening on 0.0.0.0:3000). Phone and Mac must be on the same Wi‑Fi.";
const DATABASE_UNAVAILABLE_MESSAGE =
  "Database is not connected. On your Mac: install Postgres (brew install postgresql@16 && brew services start postgresql@16), then run pnpm run db:setup, restart the API (pnpm run kill:api && pnpm run dev:api), and reload this app.";
const OUTSIDE_AUTHORIZED_PLAZA_MESSAGE =
  "You are outside the authorized toll plaza location. Attendance operations are not allowed.";
const PLAZA_GPS_NOT_CONFIGURED_MESSAGE = "Plaza GPS coordinates not configured.";
const API_NOT_RUNNING_MESSAGE = BACKEND_UNREACHABLE_MESSAGE;
const DEFAULT_PERMISSION_ERROR = "You do not have permission to perform this action.";
const DEFAULT_SESSION_ERROR = "Your session has expired. Please sign in again.";

const TECHNICAL_PATTERNS = [
  /https?:\/\/\S+/i,
  /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.\d{1,3}\.\d{1,3})\b/i,
  /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/i,
  /\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/i,
  /\bpnpm\s+--filter\b/i,
  /\bRun:\s*pnpm\b/i,
  /\bEXPO_PUBLIC_[A-Z0-9_]+\b/,
  /\bstack trace\b/i,
  /^\s*at\s+/m,
  /\bnetwork request failed\b/i,
  /\bfailed to fetch\b/i,
  /\bfetch failed\b/i,
  /\btimeout(?:ed)?\b/i,
  /\baborterror\b/i,
  /\beconn|enotfound|ehost|etimedout|eai_again\b/i,
  /\bunable to reach api\b/i,
  /\bcannot reach api\b/i,
  /\bapi timed out\b/i,
  /\bhttp \d{3}\b/i,
];

function normalizeMessage(input: string): string {
  return input
    .replace(/^Error:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isTechnicalErrorMessage(message: string): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized) return true;
  if (/\baborted\b/i.test(normalized)) return true;
  return TECHNICAL_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function friendlyAbortMessage(): string {
  return DATABASE_UNAVAILABLE_MESSAGE;
}

export function friendlyBackendUnreachableMessage(): string {
  return BACKEND_UNREACHABLE_MESSAGE;
}

export function friendlyDatabaseUnavailableMessage(): string {
  return DATABASE_UNAVAILABLE_MESSAGE;
}

export function isDatabaseUnavailableResponse(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  return record.error === "database_unavailable" || record.status === "degraded";
}

/** Map API / network errors to user-facing alert text (never show raw codes like database_unavailable). */
export function formatErrorForAlert(error: unknown, fallback = DEFAULT_GENERIC_ERROR): string {
  return friendlyErrorMessage(error, fallback);
}

export function friendlyErrorMessage(error: unknown, fallback = DEFAULT_GENERIC_ERROR): string {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error ?? "");

  const cleaned = normalizeMessage(raw);
  if (!cleaned) return fallback;
  if (/\baborted\b/i.test(cleaned)) return friendlyDatabaseUnavailableMessage();
  if (/database_unavailable/i.test(cleaned)) return friendlyDatabaseUnavailableMessage();
  if (/database ping timed out/i.test(cleaned)) return friendlyDatabaseUnavailableMessage();
  if (/postgresql is not reachable/i.test(cleaned)) return friendlyDatabaseUnavailableMessage();
  if (/load (?:devices|operators|admin)/i.test(cleaned) && /timed out/i.test(cleaned)) {
    return friendlyDatabaseUnavailableMessage();
  }
  if (isTechnicalErrorMessage(cleaned)) return fallback;
  return cleaned;
}

export function friendlyConnectionMessage(): string {
  return DEFAULT_CONNECTION_ERROR;
}

/** Shown when phone cannot reach the Mac API (server off, firewall, or wrong Wi‑Fi). */
export function friendlyApiUnreachableMessage(): string {
  return API_NOT_RUNNING_MESSAGE;
}

export function isApiUnreachableError(error: unknown): boolean {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : String(error ?? "");
  const normalized = normalizeMessage(raw).toLowerCase();
  return (
    normalized.includes("network request failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("cannot reach server") ||
    normalized.includes("no healthy base found") ||
    normalized.includes("login failed while calling")
  );
}

export function friendlySessionMessage(): string {
  return DEFAULT_SESSION_ERROR;
}

export function friendlyPermissionMessage(): string {
  return DEFAULT_PERMISSION_ERROR;
}

export function friendlyLoadMessage(): string {
  return DEFAULT_LOAD_ERROR;
}

export function friendlySaveMessage(): string {
  return DEFAULT_SAVE_ERROR;
}

export function friendlyUpdateMessage(): string {
  return DEFAULT_UPDATE_ERROR;
}

export function friendlyDeleteMessage(): string {
  return DEFAULT_DELETE_ERROR;
}

export function friendlyGeofenceMessage(): string {
  return OUTSIDE_AUTHORIZED_PLAZA_MESSAGE;
}

export function plazaGpsNotConfiguredMessage(): string {
  return PLAZA_GPS_NOT_CONFIGURED_MESSAGE;
}
