import {
  collectSensitiveValues,
  getUnexpectedErrorDiagnostic,
} from "../prisma/initial-admin-diagnostics";

describe("initial ADMIN error diagnostics", () => {
  it("reports error name and code while redacting credentials and hashes", () => {
    const databaseUrl = "postgresql://app_user:db-password@db.internal/company";
    const jwtSecret = "a-private-jwt-secret-that-must-not-be-logged";
    const userPassword = "a-private-admin-password";
    const passwordHash = `$2b$12$${"A".repeat(53)}`;
    const sensitiveValues = collectSensitiveValues([
      databaseUrl,
      jwtSecret,
      userPassword,
      passwordHash,
    ]);

    const diagnostic = getUnexpectedErrorDiagnostic(
      Object.assign(
        new Error(
          `Could not connect to ${databaseUrl}; JWT_SECRET=${jwtSecret}; password=${userPassword}; hash=${passwordHash}`,
        ),
        { code: "P1001" },
      ),
      sensitiveValues,
    );

    expect(diagnostic.name).toBe("Error");
    expect(diagnostic.prismaCode).toBe("P1001");
    expect(diagnostic.message).toContain("[REDACTED]");
    expect(diagnostic.message).not.toContain("db-password");
    expect(diagnostic.message).not.toContain(jwtSecret);
    expect(diagnostic.message).not.toContain(userPassword);
    expect(diagnostic.message).not.toContain(passwordHash);
  });

  it("redacts labeled secrets and bearer tokens in unknown errors", () => {
    const diagnostic = getUnexpectedErrorDiagnostic(
      {
        name: "PrismaClientInitializationError",
        message:
          "DATABASE_URL=postgresql://user:pass@db/app API_KEY=private-key Authorization: Bearer eyJabcdefghijk.payload.signature",
      },
      collectSensitiveValues([]),
    );

    expect(diagnostic.name).toBe("PrismaClientInitializationError");
    expect(diagnostic.message).not.toContain("postgresql://");
    expect(diagnostic.message).not.toContain("Bearer eyJ");
    expect(diagnostic.message).not.toContain("private-key");
    expect(diagnostic.message).toContain("[REDACTED]");
    expect(diagnostic.message).toContain("[REDACTED_TOKEN]");
  });
});
