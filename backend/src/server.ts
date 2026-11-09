import { app } from "./app";
import { loadConfig } from "./config";
import { startLowStockAlertJob } from "./modules/alerts/alerts.service";

const config = loadConfig(process.env);

startLowStockAlertJob(config.lowStockAlertSchedule);
app.listen(config.port, () => {
  console.info(`API listening on port ${config.port}`);
});
