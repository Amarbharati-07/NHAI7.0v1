import { apiFetch, resolveApiBase } from "./apiConfig";
import type { AuthUser } from "@/types/auth";
import { friendlyApiUnreachableMessage, isApiUnreachableError } from "./userMessages";

export interface LoginDevicePayload {
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  deviceType: string;
  deviceToken?: string;
  plazaName: string;
  status: string;
}

export interface LoginResponse {
  user: AuthUser;
  device?: LoginDevicePayload | null;
}

export interface LoginErrorBody {
  error?: string;
}

export async function loginWithApi(
  userId: string,
  password: string,
): Promise<{ user: AuthUser; device?: LoginDevicePayload | null } | { error: string }> {
  let base = "";
  let url = "";
  try {
    base = await resolveApiBase(true);
    url = `${base}/auth/login`;
    console.info("[LOGIN] Base URL:", base);
    console.info("[LOGIN] Request URL:", url);
    console.info("[LOGIN] Request Body:", {
      userId: userId.trim().toUpperCase(),
      password: "[redacted]",
    });
    const res = await apiFetch(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          userId: userId.trim().toUpperCase(),
          password,
        }),
      },
      15000,
    );

    const bodyText = await res.clone().text().catch(() => "");
    console.info("[LOGIN] Response Status:", res.status);
    console.info("[LOGIN] Response Body:", bodyText || "(empty)");
    const body = safeParseLoginBody(bodyText) as LoginResponse & LoginErrorBody;

    if (!res.ok) {
      return { error: body.error ?? bodyText.trim() ?? "Invalid User ID or Password" };
    }

    if (!body.user?.userId) {
      return { error: bodyText.trim() || "Invalid login response from server" };
    }

    console.info("LOGIN_RESPONSE", {
      userId: body.user.userId,
      plazaId: body.user.plazaId ?? "",
      plazaName: body.user.plazaName ?? "",
      loginCount: body.user.loginCount ?? 0,
      deviceId: body.device?.deviceId ?? "",
      deviceToken: body.device?.deviceToken?.slice(0, 12) ?? "",
    });
    return { user: body.user, device: body.device ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? "");
    if (isApiUnreachableError(message) || isApiUnreachableError(err)) {
      console.warn("[LOGIN] API unreachable", { url, message });
      return { error: friendlyApiUnreachableMessage() };
    }
    return {
      error: `Login failed while calling ${url}. Last error: ${message || "Unknown error"}`,
    };
  }
}

function safeParseLoginBody(bodyText: string): unknown {
  const trimmed = bodyText.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    return { error: trimmed };
  }
}
