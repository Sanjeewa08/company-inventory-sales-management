import { resolve } from "node:path";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config({ path: resolve(__dirname, "../../../.env") });

const validNodeEnvironments = ["development", "test", "production"] as const;

export interface AppConfig {
  readonly databaseUrl: string;
  readonly jwtSecret: string;
  readonly nodeEnv: (typeof validNodeEnvironments)[number];
  readonly port: number;
  readonly trustProxyHops: number;
  readonly lowStockAlertSchedule: string;
}

/**
 * Validates process environment values and returns the application configuration.
 */
export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const rawPort = env.PORT ?? "3000";
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const rawTrustProxyHops = env.TRUST_PROXY_HOPS ?? "0";
  const trustProxyHops = Number(rawTrustProxyHops);
  if (
    !Number.isInteger(trustProxyHops) ||
    trustProxyHops < 0 ||
    trustProxyHops > 10
  ) {
    throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 10");
  }

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const jwtSecret = env.JWT_SECRET?.trim();
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long");
  }

  const nodeEnv = env.NODE_ENV ?? "development";
  if (!validNodeEnvironments.includes(nodeEnv as AppConfig["nodeEnv"])) {
    throw new Error("NODE_ENV must be development, test, or production");
  }

  const lowStockAlertSchedule = env.LOW_STOCK_ALERT_CRON?.trim() || "0 0 * * *";
  if (!cron.validate(lowStockAlertSchedule)) {
    throw new Error("LOW_STOCK_ALERT_CRON must be a valid cron expression");
  }

  return Object.freeze({
    databaseUrl,
    jwtSecret,
    nodeEnv: nodeEnv as AppConfig["nodeEnv"],
    port,
    trustProxyHops,
    lowStockAlertSchedule,
  });
}
