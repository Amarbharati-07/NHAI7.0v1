import { apiFetch, getApiBase } from "./apiConfig";
import type { AuthUser } from "@/types/auth";

export interface LoginResponse {
  user: AuthUser;
}

export interface LoginErrorBody {
  error?: string;
}

export async function loginWithApi(
  userId: string,
  password: string,
): Promise<{ user: AuthUser } | { error: string }> {
  const base = getApiBase();
  try {
    const res = await apiFetch(
      `${base}/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId.trim().toUpperCase(),
          password,
        }),
      },
      15000,
    );

    const body = (await res.json().catch(() => ({}))) as LoginResponse & LoginErrorBody;

    if (!res.ok) {
      return { error: body.error ?? "Invalid User ID or Password" };
    }

    if (!body.user?.userId) {
      return { error: "Invalid login response from server" };
    }

    return { user: body.user };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortError") {
      return {
        error: `Server did not respond in time. Check that the API is running at ${base}`,
      };
    }
    return {
      error: `Cannot reach server at ${base}. Use your computer's LAN IP (not localhost) and ensure the API is running.`,
    };
  }
}
