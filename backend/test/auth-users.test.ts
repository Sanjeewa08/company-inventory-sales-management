import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { AppError } from "../src/utils/app-error";
import { withBranchScope } from "../src/middleware/branch-scope";
import { openApiSpec } from "../src/swagger";

jest.mock("../src/prisma/client", () => ({
  prisma: jest.requireActual("./support/prisma-mock").prismaMock,
}));

import { app } from "../src/app";
import { mockAuditCreate, mockFindUnique } from "./support/prisma-mock";

const jwtSecret = process.env.JWT_SECRET!;
const testUserId = "d4f79285-4be7-4c54-95a7-143268b8474c";
const branchId = "e501fe6c-78bb-432a-b3b2-cfab4d08e8f3";
const timestamp = new Date("2026-01-01T00:00:00.000Z");
const password = "CorrectPassword123";

function accessToken(role: "ADMIN" | "SALES" = "ADMIN"): string {
  return jwt.sign({ role, branchId }, jwtSecret, {
    subject: testUserId,
    expiresIn: "1h",
  });
}

async function setUser(
  options: { role?: "ADMIN" | "SALES"; isActive?: boolean } = {},
): Promise<void> {
  mockFindUnique.mockResolvedValue({
    id: testUserId,
    name: "Test User",
    email: "test@example.com",
    passwordHash: await bcrypt.hash(password, 4),
    role: options.role ?? "ADMIN",
    branchId,
    isActive: options.isActive ?? true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

beforeEach(() => {
  mockFindUnique.mockReset();
  mockAuditCreate.mockReset().mockResolvedValue({});
});

describe("authentication and user access", () => {
  it("logs in successfully and never returns the password hash", async () => {
    await setUser();

    const response = await request(app)
      .post("/auth/login")
      .set("Origin", "http://localhost:5173")
      .send({ email: "TEST@example.com", password })
      .expect(200);

    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user.email).toBe("test@example.com");
    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "LOGIN",
          entityId: testUserId,
          ip: expect.any(String),
        }),
      }),
    );
  });

  it("allows the frontend's login preflight request", async () => {
    await request(app)
      .options("/auth/login")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type")
      .expect(204)
      .expect("Access-Control-Allow-Origin", "http://localhost:5173")
      .expect("Access-Control-Allow-Methods", /POST/);
  });

  it("uses configured comma-separated CORS origins", async () => {
    const previousOrigins = process.env.CORS_ORIGIN;
    process.env.CORS_ORIGIN =
      "https://frontend.example.test,http://localhost:5173";

    try {
      await request(app)
        .options("/auth/login")
        .set("Origin", "https://frontend.example.test")
        .set("Access-Control-Request-Method", "POST")
        .expect(204)
        .expect(
          "Access-Control-Allow-Origin",
          "https://frontend.example.test",
        );
    } finally {
      if (previousOrigins === undefined) {
        delete process.env.CORS_ORIGIN;
      } else {
        process.env.CORS_ORIGIN = previousOrigins;
      }
    }
  });

  it("rejects a wrong password", async () => {
    await setUser();

    await request(app)
      .post("/auth/login")
      .send({ email: "test@example.com", password: "WrongPassword123" })
      .expect(401);

    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("does not allow a deactivated user to log in", async () => {
    await setUser({ isActive: false });

    await request(app)
      .post("/auth/login")
      .send({ email: "test@example.com", password })
      .expect(401);

    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it("rejects a missing token", async () => {
    await request(app).get("/auth/me").expect(401);
  });

  it("forbids user management for a non-admin role", async () => {
    await setUser({ role: "SALES" });

    await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${accessToken("SALES")}`)
      .expect(403);
  });

  it("restricts branch filters to the authenticated user's branch", () => {
    const storekeeper = { role: "SALES" as const, branchId };

    expect(withBranchScope(storekeeper, { status: "OPEN" })).toEqual({
      status: "OPEN",
      branchId,
    });
    expect(() =>
      withBranchScope(storekeeper, { branchId: "another-branch" }),
    ).toThrow(AppError);
    expect(withBranchScope({ role: "MANAGER", branchId: null }, {})).toEqual(
      {},
    );
  });

  it("returns validation errors for invalid bodies and queries", async () => {
    await request(app)
      .post("/auth/login")
      .send({ email: "not-an-email", password: "" })
      .expect(400)
      .expect((response) => {
        expect(response.body.error.code).toBe("VALIDATION_ERROR");
      });

    await setUser();
    await request(app)
      .get("/users?limit=101")
      .set("Authorization", `Bearer ${accessToken()}`)
      .expect(400)
      .expect((response) => {
        expect(response.body.error.code).toBe("VALIDATION_ERROR");
      });
  });

  it("serves the generated Swagger UI", async () => {
    await request(app)
      .get("/api-docs/")
      .expect(200)
      .expect("Content-Type", /html/);
    const specification = JSON.stringify(openApiSpec);
    expect(specification).toContain("/auth/login");
    expect(specification).toContain("/users/{id}");
  });
});
