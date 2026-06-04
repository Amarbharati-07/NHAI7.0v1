import app, { logRegisteredRoutes } from "./app";
import { logger } from "./lib/logger";
import { pingDatabase } from "./routes/health";

const rawPort = process.env["PORT"] ?? "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const host = process.env["HOST"] ?? "0.0.0.0";

app.listen(port, host, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, host }, "Server listening");
  logRegisteredRoutes();

  void pingDatabase(5_000).then((db) => {
    if (db.ok) {
      logger.info("Database connection OK");
      return;
    }
    logger.warn(
      { error: db.error },
      "Database not ready — /api/health is OK but admin/login will hang or fail until DATABASE_URL works",
    );
  });
});
