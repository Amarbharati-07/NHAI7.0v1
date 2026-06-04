import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router, { listRegisteredRoutes } from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "Goverment-NHAI API",
    endpoints: {
      api: "/api",
      health: "/api/health",
      healthz: "/api/healthz",
    },
  });
});

app.get("/api", (_req, res) => {
  res.json({
    status: "ok",
    message: "NHAI attendance API is running",
    endpoints: {
      health: "/api/health",
      auth: "/api/auth/login",
      operators: "/api/operators/:userId/bootstrap",
      attendance: "/api/attendance",
      admin: "/api/admin/plazas",
    },
  });
});

app.use("/api", router);

export default app;

export function logRegisteredRoutes() {
  const routes = ["GET /", "GET /api", ...listRegisteredRoutes()];
  logger.info({ routes }, "Registered API routes");
  for (const route of routes) {
    logger.info(route);
  }
}
