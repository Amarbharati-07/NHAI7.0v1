import { Router, type IRouter } from "express";
import healthRouter from "./health";
import syncRouter from "./sync";
import attendanceRouter from "./attendance";
import adminRouter from "./admin";
import authRouter from "./auth";
import geofenceRouter from "./geofence";
import operatorsRouter from "./operators";
import workersRouter from "./workers";
import { requireDatabaseMiddleware } from "../middleware/database";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireDatabaseMiddleware);
router.use(authRouter);
router.use(operatorsRouter);
router.use(workersRouter);
router.use(geofenceRouter);
router.use(syncRouter);
router.use(attendanceRouter);
router.use(adminRouter);

export function listRegisteredRoutes(basePath = "/api"): string[] {
  const routes: string[] = [];
  const seen = new Set<string>();

  function walk(node: any, prefix = "") {
    for (const layer of node?.stack ?? []) {
      if (layer.route?.path) {
        const routePath = Array.isArray(layer.route.path) ? layer.route.path[0] : layer.route.path;
        const methods = Object.keys(layer.route.methods ?? {}).map((m) => m.toUpperCase());
        for (const method of methods) {
          const full = `${basePath}${prefix}${routePath}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
          const entry = `${method} ${full}`;
          if (!seen.has(entry)) {
            seen.add(entry);
            routes.push(entry);
          }
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle, prefix);
      }
    }
  }

  walk(router);
  return routes.sort();
}

export default router;
