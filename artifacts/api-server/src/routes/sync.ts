import { Router } from "express";
import { db } from "@workspace/db";
import { workersTable, attendanceTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

async function uploadToS3(
  key: string,
  body: string,
): Promise<{ success: boolean; s3Key?: string; bucket?: string; error?: string }> {
  const region = process.env["AWS_REGION"];
  const bucket = process.env["AWS_BUCKET_NAME"];
  const accessKeyId = process.env["AWS_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["AWS_SECRET_ACCESS_KEY"];

  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    return { success: false, error: "AWS credentials not configured" };
  }

  try {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "application/json",
        ServerSideEncryption: "AES256",
        Metadata: {
          source: "nhai-spectra-id",
          "uploaded-at": new Date().toISOString(),
        },
      }),
    );
    return { success: true, s3Key: key, bucket };
  } catch (e) {
    logger.warn({ err: e }, "S3 upload failed");
    return { success: false, error: (e as Error).message };
  }
}

router.get("/sync/aws-status", (_req, res) => {
  const region = process.env["AWS_REGION"];
  const bucket = process.env["AWS_BUCKET_NAME"];
  const hasKey = !!process.env["AWS_ACCESS_KEY_ID"];
  const configured = !!(region && bucket && hasKey);
  res.json({
    configured,
    bucket: configured ? bucket : undefined,
    region: configured ? region : undefined,
  });
});

router.post("/sync", async (req, res) => {
  const {
    workers = [],
    attendance = [],
    deviceToken,
    plazaId,
  } = req.body as {
    workers: Array<{
      workerId: string;
      fullName: string;
      mobile?: string;
      department?: string;
      contractorName?: string;
      employeeType?: string;
      siteLocation?: string;
      plazaId?: string;
      operatorId?: string;
      deviceToken?: string;
      status?: string;
    }>;
    attendance: Array<{
      mobileWorkerId: number;
      workerIdCode?: string;
      date: string;
      time: string;
      status?: string;
      plazaId?: string;
      operatorId?: string;
      deviceToken?: string;
      latitude?: string;
      longitude?: string;
    }>;
    deviceToken?: string;
    plazaId?: string;
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
      errors.push(
        `attendance ${a.date}/${a.mobileWorkerId}: ${(e as Error).message}`,
      );
    }
  }

  const resolvedPlaza = plazaId ?? attendance[0]?.plazaId ?? workers[0]?.plazaId ?? "unknown";
  const resolvedDevice = deviceToken ?? attendance[0]?.deviceToken ?? workers[0]?.deviceToken ?? "unknown";
  const dateStr = new Date().toISOString().split("T")[0];
  const s3Key = `nhai/attendance/${dateStr}/${resolvedPlaza}_${resolvedDevice}_${Date.now()}.json`;

  const s3Payload = JSON.stringify({
    syncedAt: new Date().toISOString(),
    deviceToken: resolvedDevice,
    plazaId: resolvedPlaza,
    summary: { workers: syncedWorkers, attendance: syncedAttendance },
    workers,
    attendance,
  });

  const awsResult = await uploadToS3(s3Key, s3Payload);

  res.json({
    success: true,
    synced: { workers: syncedWorkers, attendance: syncedAttendance },
    errors,
    aws: awsResult.success
      ? { uploaded: true, s3Key: awsResult.s3Key, bucket: awsResult.bucket }
      : { uploaded: false, error: awsResult.error },
  });
});

export default router;
