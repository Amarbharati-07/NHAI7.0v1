import { Router } from "express";
import { db } from "@workspace/db";
import { workersTable, attendanceTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";

const router = Router();

router.post("/sync", async (req, res) => {
  const { workers = [], attendance = [] } = req.body as {
    workers: Array<{
      workerId: string; fullName: string; mobile?: string; department?: string;
      contractorName?: string; employeeType?: string; siteLocation?: string;
      plazaId?: string; operatorId?: string; deviceToken?: string; status?: string;
    }>;
    attendance: Array<{
      mobileWorkerId: number; workerIdCode?: string; date: string; time: string;
      status?: string; plazaId?: string; operatorId?: string; deviceToken?: string;
      latitude?: string; longitude?: string;
    }>;
  };

  let syncedWorkers = 0;
  let syncedAttendance = 0;
  const errors: string[] = [];

  for (const w of workers) {
    try {
      await db
        .insert(workersTable)
        .values({
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
        })
        .onConflictDoUpdate({
          target: workersTable.workerId,
          set: {
            fullName: sql`excluded.full_name`,
            mobile: sql`excluded.mobile`,
            department: sql`excluded.department`,
            contractorName: sql`excluded.contractor_name`,
            employeeType: sql`excluded.employee_type`,
            siteLocation: sql`excluded.site_location`,
            plazaId: sql`excluded.plaza_id`,
            operatorId: sql`excluded.operator_id`,
            deviceToken: sql`excluded.device_token`,
            status: sql`excluded.status`,
          },
        });
      syncedWorkers++;
    } catch (e) {
      errors.push(`worker ${w.workerId}: ${(e as Error).message}`);
    }
  }

  for (const a of attendance) {
    try {
      await db.insert(attendanceTable).values({
        mobileWorkerId: a.mobileWorkerId,
        workerIdCode: a.workerIdCode ?? "",
        date: a.date,
        time: a.time,
        status: a.status ?? "present",
        plazaId: a.plazaId ?? "",
        operatorId: a.operatorId ?? "",
        deviceToken: a.deviceToken ?? "",
        latitude: a.latitude ?? "",
        longitude: a.longitude ?? "",
      });
      syncedAttendance++;
    } catch (e) {
      errors.push(`attendance ${a.date}/${a.mobileWorkerId}: ${(e as Error).message}`);
    }
  }

  res.json({
    success: true,
    synced: { workers: syncedWorkers, attendance: syncedAttendance },
    errors,
  });
});

export default router;
