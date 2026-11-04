import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("loads valid values and applies the default port and environment", () => {
    expect(
      loadConfig({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/inventory",
      }),
    ).toEqual({
      databaseUrl: "postgresql://user:pass@localhost:5432/inventory",
      nodeEnv: "development",
      port: 3000,
    });
  });

  it("rejects an invalid port", () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/inventory",
        PORT: "70000",
      }),
    ).toThrow("PORT must be an integer between 1 and 65535");
  });

  it("requires a database URL", () => {
    expect(() => loadConfig({})).toThrow("DATABASE_URL is required");
  });
});
