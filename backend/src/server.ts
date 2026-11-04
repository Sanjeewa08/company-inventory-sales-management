import { app } from "./app";
import { loadConfig } from "./config";

const config = loadConfig(process.env);

app.listen(config.port, () => {
  console.info(`API listening on port ${config.port}`);
});
