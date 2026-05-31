import { Router } from "express";
import bcrypt from "bcrypt";
import { db } from "@workspace/db";
import { operatorsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

const SALT_ROUNDS = 10;

const ADMIN_USER_ID = "ADMIN001";
const DEFAULT_ADMIN_PASSWORD = "admin123";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

router.post("/auth/login", async (req, res) => {
  try {
    const { userId, password } = req.body as { userId?: string; password?: string };
    if (!userId?.trim() || !password) {
      res.status(400).json({ error: "userId and password are required" });
      return;
    }

    const uid = userId.trim().toUpperCase();

    if (uid === ADMIN_USER_ID || uid.startsWith("ADMIN")) {
      const expected = process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
      if (password !== expected) {
        res.status(401).json({ error: "Invalid User ID or Password" });
        return;
      }
      res.json({
        user: {
          id: 0,
          userId: ADMIN_USER_ID,
          name: "System Admin",
          role: "admin" as const,
        },
      });
      return;
    }

    const [operator] = await db
      .select()
      .from(operatorsTable)
      .where(eq(operatorsTable.userId, uid))
      .limit(1);

    if (!operator) {
      res.status(401).json({ error: "Invalid User ID or Password" });
      return;
    }

    if (!operator.passwordHash) {
      res.status(401).json({
        error: "Account has no password set. Ask an admin to reset your password.",
      });
      return;
    }

    const valid = await bcrypt.compare(password, operator.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid User ID or Password" });
      return;
    }

    if (operator.status === "suspended") {
      res.status(403).json({ error: "Account suspended. Contact your administrator." });
      return;
    }

    const loginCount = (operator.loginCount ?? 0) + 1;
    const lastLogin = new Date().toLocaleString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const lastLoginLabel = `Today, ${lastLogin}`;

    await db
      .update(operatorsTable)
      .set({ loginCount, lastLogin: lastLoginLabel })
      .where(eq(operatorsTable.userId, uid));

    res.json({
      user: {
        id: operator.id,
        userId: operator.userId,
        name: operator.name,
        role: "operator" as const,
        plazaId: operator.plazaId ?? "",
        plazaName: operator.plazaName ?? "Unassigned",
        status: operator.status ?? "active",
      },
    });
  } catch (err) {
    console.error("[auth/login]", err);
    res.status(500).json({ error: "Login failed" });
  }
});

export default router;
