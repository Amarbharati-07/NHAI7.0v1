import { Router } from "express";
import { db } from "@workspace/db";
import { geofenceEventsTable } from "@workspace/db/schema";

const router = Router();

router.post("/geofence/events", async (req, res) => {
  try {
    const {
      operatorId,
      plazaId,
      latitude,
      longitude,
      distanceMeters,
      timestamp,
      result,
    } = req.body as {
      operatorId?: string;
      plazaId?: string;
      latitude?: number | string;
      longitude?: number | string;
      distanceMeters?: number | string;
      timestamp?: string;
      result?: string;
    };

    if (!operatorId || !plazaId || latitude === undefined || longitude === undefined || distanceMeters === undefined || !timestamp || !result) {
      return void res.status(400).json({ error: "operatorId, plazaId, latitude, longitude, distanceMeters, timestamp, and result are required" });
    }

    const [row] = await db
      .insert(geofenceEventsTable)
      .values({
        operatorId: String(operatorId).toUpperCase(),
        plazaId: String(plazaId).toUpperCase(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        distanceMeters: Math.round(Number(distanceMeters)),
        eventTimestamp: String(timestamp),
        result: String(result),
      })
      .returning();

    res.status(201).json(row);
  } catch (err) {
    console.error("[geofence/events]", err);
    res.status(500).json({ error: "Failed to store geofence event" });
  }
});

export default router;
