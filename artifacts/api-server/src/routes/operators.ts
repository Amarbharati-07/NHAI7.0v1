import { Router } from "express";
import { db } from "@workspace/db";
import { operatorsTable, workersTable, devicesTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

/** Operator offline bundle: plaza workers + assigned device for local cache. */
router.get("/operators/:userId/bootstrap", async (req, res) => {
  try {
    const userId = String(req.params.userId ?? "").toUpperCase();
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

    const deviceRows = await db
      .select()
      .from(devicesTable)
      .where(eq(devicesTable.operatorId, userId));

    const activeDevice =
      deviceRows.find((d) => d.status === "active") ??
      deviceRows.find((d) => d.status === "pending") ??
      deviceRows[0] ??
      null;

    res.json({
      operator: {
        id: operator.id,
        userId: operator.userId,
        name: operator.name,
        role: "operator" as const,
        plazaId: operator.plazaId ?? "",
        plazaName: operator.plazaName ?? "Unassigned",
        status: operator.status ?? "active",
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
