import { Router } from "express";
import { db } from "@workspace/db";
import { attendanceTable, workersTable } from "@workspace/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";

const router = Router();

router.get("/attendance/stats", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const dateParam = (req.query["date"] as string) || today;

    const rows = await db
      .select({
        status: attendanceTable.status,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(attendanceTable)
      .where(eq(attendanceTable.date, dateParam))
      .groupBy(attendanceTable.status);

    let present = 0;
    let absent = 0;
    for (const r of rows) {
      if (r.status === "present") present = Number(r.count);
      else if (r.status === "absent") absent = Number(r.count);
    }

    const totalWorkers = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(workersTable)
      .where(eq(workersTable.status, "active"));

    const total = Number(totalWorkers[0]?.count ?? 0);
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;

    res.json({ date: dateParam, present, absent, total, rate });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get("/attendance/weekly", async (_req, res) => {
  try {
    const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const result: { day: string; date: string; count: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayName = DAY_NAMES[d.getDay()];

      const row = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(attendanceTable)
        .where(
          and(
            eq(attendanceTable.date, dateStr),
            eq(attendanceTable.status, "present")
          )
        );

      result.push({ day: dayName, date: dateStr, count: Number(row[0]?.count ?? 0) });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get("/attendance", async (req, res) => {
  try {
    const dateParam = req.query["date"] as string | undefined;
    const plazaId = req.query["plazaId"] as string | undefined;
    const limit = Math.min(Number(req.query["limit"] ?? 100), 500);
    const offset = Number(req.query["offset"] ?? 0);

    const conditions = [];
    if (dateParam) conditions.push(eq(attendanceTable.date, dateParam));
    if (plazaId) conditions.push(eq(attendanceTable.plazaId, plazaId));

    const rows = await db
      .select({
        id: attendanceTable.id,
        workerIdCode: attendanceTable.workerIdCode,
        date: attendanceTable.date,
        time: attendanceTable.time,
        status: attendanceTable.status,
        plazaId: attendanceTable.plazaId,
        operatorId: attendanceTable.operatorId,
        createdAt: attendanceTable.createdAt,
      })
      .from(attendanceTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(attendanceTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ records: rows, count: rows.length, limit, offset });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
