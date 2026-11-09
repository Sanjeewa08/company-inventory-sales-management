import jwt from "jsonwebtoken";
import request from "supertest";
import type { AuthenticatedUser } from "../src/middleware/authenticate";
import { openApiSpec } from "../src/swagger";
import {
  auditMocks,
  resetSalesMocks,
  userMocks,
} from "./support/sales-prisma-mock";

jest.mock("../src/prisma/client", () => ({
  prisma: jest.requireActual("./support/sales-prisma-mock").salesPrismaMock,
}));

import { app } from "../src/app";

const secret = process.env.JWT_SECRET!;
const actorId = "d4f79285-4be7-4c54-95a7-143268b8474c";
const branchId = "e501fe6c-78bb-432a-b3b2-cfab4d08e8f3";
const actor: AuthenticatedUser = {
  id: actorId,
  name: "Test Administrator",
  email: "admin@example.com",
  role: "ADMIN",
  branchId,
  isActive: true,
};

function token(role: "ADMIN" | "MANAGER") {
  return jwt.sign({ role, branchId }, secret, {
    subject: actorId,
    expiresIn: "1h",
  });
}

function setAuthenticatedUser(role: "ADMIN" | "MANAGER") {
  userMocks.findUnique.mockResolvedValue({ ...actor, role });
}

beforeEach(() => {
  resetSalesMocks();
});

describe("audit log API", () => {
  it("documents the admin audit-log endpoint", () => {
    expect(JSON.stringify(openApiSpec)).toContain("/audit-logs");
  });

  it("filters and paginates audit entries for admins", async () => {
    setAuthenticatedUser("ADMIN");
    auditMocks.findMany.mockResolvedValue([]);
    auditMocks.count.mockResolvedValue(17);

    await request(app)
      .get(
        "/audit-logs?userId=d4f79285-4be7-4c54-95a7-143268b8474c&entity=Invoice&action=CREATE&startDate=2026-01-01T00:00:00.000Z&endDate=2026-01-31T23:59:59.999Z&page=2&limit=5&sortBy=createdAt&sortOrder=asc",
      )
      .set("Authorization", `Bearer ${token("ADMIN")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.auditLogs).toEqual([]);
        expect(body.pagination).toEqual({
          page: 2,
          limit: 5,
          total: 17,
          totalPages: 4,
        });
      });

    expect(auditMocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: actorId,
          entity: "Invoice",
          action: "CREATE",
          createdAt: {
            gte: new Date("2026-01-01T00:00:00.000Z"),
            lte: new Date("2026-01-31T23:59:59.999Z"),
          },
        },
        orderBy: { createdAt: "asc" },
        skip: 5,
        take: 5,
      }),
    );
    expect(auditMocks.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: actorId, action: "CREATE" }),
      }),
    );
  });

  it("rejects non-admin access and invalid date ranges", async () => {
    setAuthenticatedUser("MANAGER");
    await request(app)
      .get("/audit-logs")
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .expect(403);
    expect(auditMocks.findMany).not.toHaveBeenCalled();

    setAuthenticatedUser("ADMIN");
    await request(app)
      .get(
        "/audit-logs?startDate=2026-02-01T00:00:00.000Z&endDate=2026-01-01T00:00:00.000Z",
      )
      .set("Authorization", `Bearer ${token("ADMIN")}`)
      .expect(400);
    expect(auditMocks.findMany).not.toHaveBeenCalled();
  });
});
