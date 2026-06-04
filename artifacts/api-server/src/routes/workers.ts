import { Router } from "express";
import { db } from "@workspace/db";
import { workersTable, attendanceTable } from "@workspace/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

const router = Router();

function normalizeWorkerText(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

router.post("/workers", async (req, res) => {
  try {
    console.info("[WORKERS] Request received");
    console.info("[WORKERS] Request Payload", req.body);

    const workerId = normalizeWorkerText(req.body?.workerId).toUpperCase();
    const fullName = normalizeWorkerText(req.body?.fullName);
    const mobile = normalizeWorkerText(req.body?.mobile);
    const department = normalizeWorkerText(req.body?.department);
    const contractorName = normalizeWorkerText(req.body?.contractorName);
    const employeeType = normalizeWorkerText(req.body?.employeeType);
    const siteLocation = normalizeWorkerText(req.body?.siteLocation);
    const plazaId = normalizeWorkerText(req.body?.plazaId);
    const operatorId = normalizeWorkerText(req.body?.operatorId);
    const deviceToken = normalizeWorkerText(req.body?.deviceToken);
    const status = normalizeWorkerText(req.body?.status, "active");

    if (!workerId) {
      return void res.status(400).json({ error: "workerId is required" });
    }
    if (!fullName) {
      return void res.status(400).json({ error: "fullName is required" });
    }

    await db
      .insert(workersTable)
      .values({
        workerId,
        fullName,
        mobile,
        department,
        contractorName,
        employeeType,
        siteLocation,
        plazaId,
        operatorId,
        deviceToken,
        status,
      })
      .onConflictDoUpdate({
        target: workersTable.workerId,
        set: {
          fullName,
          mobile,
          department,
          contractorName,
          employeeType,
          siteLocation,
          plazaId,
          operatorId,
          deviceToken,
          status,
        },
      });

    const [workerRow] = await db
      .select()
      .from(workersTable)
      .where(eq(workersTable.workerId, workerId))
      .limit(1);

    console.info("[WORKERS] Database Row After Save", workerRow);
    console.info("[WORKERS] API Response", { worker: workerRow });

    return void res.status(201).json({ worker: workerRow });
  } catch (err) {
    console.error("[WORKERS] Error details", err);
    const message = err instanceof Error ? err.message : "Failed to register worker";
    return void res.status(500).json({ error: message });
  }
});

router.get("/workers", async (req, res) => {
  try {
    const plazaId = String(req.query["plazaId"] ?? "").trim();
    const operatorId = String(req.query["operatorId"] ?? "").trim();
    const status = String(req.query["status"] ?? "").trim();

    const filters = [];
    if (plazaId) filters.push(eq(workersTable.plazaId, plazaId));
    if (operatorId) filters.push(eq(workersTable.operatorId, operatorId));
    if (status) filters.push(eq(workersTable.status, status));

    const rows = await db
      .select({
        id: workersTable.id,
        workerId: workersTable.workerId,
        fullName: workersTable.fullName,
        mobile: workersTable.mobile,
        department: workersTable.department,
        contractorName: workersTable.contractorName,
        employeeType: workersTable.employeeType,
        siteLocation: workersTable.siteLocation,
        plazaId: workersTable.plazaId,
        operatorId: workersTable.operatorId,
        deviceToken: workersTable.deviceToken,
        status: workersTable.status,
        createdAt: workersTable.createdAt,
      })
      .from(workersTable)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(workersTable.createdAt));

    res.json({ workers: rows, count: rows.length });
  } catch (err) {
    console.error("[workers]", err);
    res.status(500).json({ error: "Failed to fetch workers" });
  }
});

router.get("/workers/:workerId", async (req, res) => {
  try {
    const workerId = String(req.params.workerId ?? "").trim();
    if (!workerId) {
      return void res.status(400).json({ error: "workerId required" });
    }

    const [worker] = await db
      .select({
        id: workersTable.id,
        workerId: workersTable.workerId,
        fullName: workersTable.fullName,
        mobile: workersTable.mobile,
        department: workersTable.department,
        contractorName: workersTable.contractorName,
        employeeType: workersTable.employeeType,
        siteLocation: workersTable.siteLocation,
        plazaId: workersTable.plazaId,
        operatorId: workersTable.operatorId,
        deviceToken: workersTable.deviceToken,
        status: workersTable.status,
        createdAt: workersTable.createdAt,
      })
      .from(workersTable)
      .where(eq(workersTable.workerId, workerId))
      .limit(1);

    if (!worker) {
      return void res.status(404).json({ error: "Worker not found" });
    }

    const [attendanceSummary] = await db
      .select({
        present: sql<number>`cast(sum(case when ${attendanceTable.status} = 'present' then 1 else 0 end) as int)`,
        absent: sql<number>`cast(sum(case when ${attendanceTable.status} = 'absent' then 1 else 0 end) as int)`,
      })
      .from(attendanceTable)
      .where(eq(attendanceTable.workerIdCode, worker.workerId));

    res.json({
      worker,
      attendance: {
        present: Number(attendanceSummary?.present ?? 0),
        absent: Number(attendanceSummary?.absent ?? 0),
      },
    });
  } catch (err) {
    console.error("[workers/:workerId]", err);
    res.status(500).json({ error: "Failed to fetch worker" });
  }
});

export default router;
