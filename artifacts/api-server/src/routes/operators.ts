import { Router } from "express";
import { db } from "@workspace/db";
import { operatorsTable, workersTable, devicesTable, tollPlazasTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

/** Operator offline bundle: plaza workers + assigned device for local cache. */
router.get("/operators/:userId/bootstrap", async (req, res) => {
  try {
    const userId = String(req.params.userId ?? "").toUpperCase();
    const requestedDeviceToken = String(req.query.deviceToken ?? "").trim();
    if (!userId) {
      return void res.status(400).json({ error: "userId required" });
    }

    const [operator] = await db
      .select()
      .from(operatorsTable)
      .where(eq(operatorsTable.userId, userId))
      .limit(1);

    if (!operator) {
      return void res.status(404).json({ error: "Operator not found" });
    }

    const workerRows = operator.plazaId
      ? await db
          .select()
          .from(workersTable)
          .where(
            and(
              eq(workersTable.plazaId, operator.plazaId),
              eq(workersTable.status, "active"),
            ),
          )
      : await db
          .select()
          .from(workersTable)
          .where(eq(workersTable.operatorId, userId));

    // Equivalent: SELECT * FROM devices WHERE operator_id = $userId AND status = 'active'
    const deviceRows = await db
      .select()
      .from(devicesTable)
      .where(
        and(
          eq(devicesTable.operatorId, userId),
          eq(devicesTable.status, "active"),
        ),
      );

    console.info("[operators/bootstrap] device query", {
      sql: "SELECT * FROM devices WHERE operator_id = ? AND status = 'active'",
      operatorId: userId,
      rowCount: deviceRows.length,
      deviceIds: deviceRows.map((d) => d.deviceId),
    });

    const activeDevice =
      (requestedDeviceToken
        ? deviceRows.find(
            (d) =>
              String((d as { deviceToken?: string }).deviceToken ?? "").trim() ===
              requestedDeviceToken,
          )
        : null) ??
      deviceRows[0] ??
      null;
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

    console.info("[operators/bootstrap]", {
      userId,
      requestedDeviceToken: requestedDeviceToken.slice(0, 12),
      deviceRows: deviceRows.length,
      selectedDeviceId: activeDevice?.deviceId ?? "",
      selectedDeviceToken: String(
        (activeDevice as { deviceToken?: string })?.deviceToken ?? "",
      ).slice(0, 12),
      plazaId: operator.plazaId ?? "",
      plazaName: operator.plazaName ?? "",
      plazaLatitude: plaza?.latitude ?? null,
      plazaLongitude: plaza?.longitude ?? null,
      plazaRadiusMeters: plaza?.radiusMeters ?? null,
    });

    res.json({
      operator: {
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
        loginCount: operator.loginCount ?? 0,
      },
      workers: workerRows.map((w) => ({
        workerId: w.workerId,
        fullName: w.fullName,
        mobile: w.mobile ?? "",
        department: w.department ?? "",
        contractorName: w.contractorName ?? "",
        employeeType: w.employeeType ?? "",
        siteLocation: w.siteLocation ?? "",
        plazaId: w.plazaId ?? "",
        operatorId: w.operatorId ?? "",
        deviceToken: w.deviceToken ?? "",
        status: w.status ?? "active",
      })),
      device: activeDevice
        ? {
            deviceId: activeDevice.deviceId,
            deviceName: activeDevice.deviceName ?? "",
            deviceModel: activeDevice.deviceModel ?? "",
            deviceType: activeDevice.deviceType ?? "android",
            deviceToken: (activeDevice as any).deviceToken ?? "",
            plazaName: activeDevice.plazaName ?? "",
            status: activeDevice.status ?? "active",
          }
        : null,
    });
  } catch (err) {
    console.error("[operators/bootstrap]", err);
    res.status(500).json({ error: "Bootstrap failed" });
  }
});

export default router;
