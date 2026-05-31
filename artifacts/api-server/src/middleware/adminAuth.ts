import type { RequestHandler } from "express";

/**
 * When ADMIN_API_KEY is set, require `Authorization: Bearer <key>` on admin routes.
 * Skipped in development when the env var is unset (local/demo workflows).
 */
export const requireAdminApiKey: RequestHandler = (req, res, next) => {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    next();
    return;
  }

  const header = req.headers.authorization;
  const token =
    typeof header === "string" && header.startsWith("Bearer ")
      ? header.slice("Bearer ".length)
      : null;

  if (!token || token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};
