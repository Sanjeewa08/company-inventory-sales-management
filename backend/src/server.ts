import { app } from "./app";
import { loadConfig } from "./config";
import { prisma } from "./prisma/client";
import { startLowStockAlertJob } from "./modules/alerts/alerts.service";

const config = loadConfig(process.env);

app.set("trust proxy", config.trustProxyHops);
const lowStockAlertJob = startLowStockAlertJob(config.lowStockAlertSchedule);
const server = app.listen(config.port, "0.0.0.0", () => {
  console.info(`API listening on port ${config.port}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.info(`Received ${signal}; shutting down API`);
  lowStockAlertJob.stop();
  server.close((error) => {
    if (error) {
      console.error("Failed to close the HTTP server cleanly", error);
      process.exitCode = 1;
    }
    void prisma.$disconnect().catch((disconnectError: unknown) => {
      console.error("Failed to disconnect Prisma cleanly", disconnectError);
      process.exitCode = 1;
    });
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
