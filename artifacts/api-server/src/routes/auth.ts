import { Router } from "express";
import bcrypt from "bcrypt";
import { db } from "@workspace/db";
import { devicesTable, operatorsTable, tollPlazasTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

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
    console.info("[auth/login] request", { userId: uid });

    if (uid === ADMIN_USER_ID || uid.startsWith("ADMIN")) {
      const expected = process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
      if (password !== expected) {
        console.info("[auth/login] admin failed", { userId: uid });
        res.status(401).json({ error: "Invalid User ID or Password" });
        return;
      }
      console.info("[auth/login] admin success", { userId: uid });
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
      console.info("[auth/login] operator not found", { userId: uid });
      res.status(401).json({ error: "Invalid User ID or Password" });
      return;
    }

    if (!operator.passwordHash) {
      console.info("[auth/login] operator has no password", { userId: uid });
      res.status(401).json({
        error: "Account has no password set. Ask an admin to reset your password.",
      });
      return;
    }

    const valid = await bcrypt.compare(password, operator.passwordHash);
    if (!valid) {
      console.info("[auth/login] operator password mismatch", { userId: uid });
      res.status(401).json({ error: "Invalid User ID or Password" });
      return;
    }

    if (operator.status === "suspended") {
      console.info("[auth/login] operator suspended", { userId: uid });
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

    const deviceRows = await db
      .select()
      .from(devicesTable)
      .where(
        and(eq(devicesTable.operatorId, uid), eq(devicesTable.status, "active")),
      );

    console.info("[auth/login] device query", {
      sql: "SELECT * FROM devices WHERE operator_id = ? AND status = 'active'",
      operatorId: uid,
      rowCount: deviceRows.length,
      deviceIds: deviceRows.map((d) => d.deviceId),
    });

    const activeDevice = deviceRows[0] ?? null;
    const [plaza] = operator.plazaId
      ? await db
          .select({
            plazaId: tollPlazasTable.plazaId,
            latitude: tollPlazasTable.latitude,
            longitude: tollPlazasTable.longitude,
            radiusMeters: tollPlazasTable.radiusMeters,
          })
          .from(tollPlazasTable)
          .where(eq(tollPlazasTable.plazaId, operator.plazaId))
          .limit(1)
      : [null];

    console.info("[auth/login] operator success", {
      userId: uid,
      operatorId: operator.id,
      plazaId: operator.plazaId ?? "",
      plazaName: operator.plazaName ?? "",
      deviceId: activeDevice?.deviceId ?? "",
      deviceToken: String(activeDevice?.deviceToken ?? "").slice(0, 12),
    });
    res.json({
      user: {
        id: operator.id,
        userId: operator.userId,
        name: operator.name,
        role: "operator" as const,
        plazaId: operator.plazaId ?? "",
        plazaName: operator.plazaName ?? "Unassigned",
        plazaLatitude: plaza?.latitude ?? null,
        plazaLongitude: plaza?.longitude ?? null,
        plazaRadiusMeters: plaza?.radiusMeters ?? null,
        status: operator.status ?? "active",
        loginCount,
      },
      device: activeDevice
        ? {
            deviceId: activeDevice.deviceId,
            deviceName: activeDevice.deviceName ?? "",
            deviceModel: activeDevice.deviceModel ?? "",
            deviceType: activeDevice.deviceType ?? "android",
            deviceToken: activeDevice.deviceToken ?? "",
            plazaName: activeDevice.plazaName ?? operator.plazaName ?? "",
            status: activeDevice.status ?? "active",
          }
        : null,
    });
  } catch (err) {
    console.error("[auth/login]", err);
    res.status(500).json({ error: "Login failed" });
  }
});

export default router;
