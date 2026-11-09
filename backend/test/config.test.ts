import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("loads valid values and applies the default port and environment", () => {
    expect(
      loadConfig({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/inventory",
        JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
      }),
    ).toEqual({
      databaseUrl: "postgresql://user:pass@localhost:5432/inventory",
      jwtSecret: "test-secret-that-is-at-least-32-characters-long",
      nodeEnv: "development",
      port: 3000,
    });
  });

  it("rejects an invalid port", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/inventory",
        JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
        PORT: "70000",
      }),
    ).toThrow("PORT must be an integer between 1 and 65535");
  });

  it("requires a database URL", () => {
    expect(() =>
      loadConfig({
        JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
      }),
    ).toThrow("DATABASE_URL is required");
  });

  it("requires a sufficiently long JWT secret", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/inventory",
      }),
    ).toThrow("JWT_SECRET must be at least 32 characters long");
  });
});
