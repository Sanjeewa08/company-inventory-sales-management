import jwt from "jsonwebtoken";
import request from "supertest";
import type { AuthenticatedUser } from "../src/middleware/authenticate";
import {
  alertMocks,
  auditMocks,
  resetSalesMocks,
  stockMocks,
  userMocks,
} from "./support/sales-prisma-mock";

jest.mock("../src/prisma/client", () => ({
  prisma: jest.requireActual("./support/sales-prisma-mock").salesPrismaMock,
}));

import { app } from "../src/app";
import { refreshAllLowStockAlerts } from "../src/modules/alerts/alerts.service";
import { openApiSpec } from "../src/swagger";

const secret = process.env.JWT_SECRET!;
const actorId = "d4f79285-4be7-4c54-95a7-143268b8474c";
const branchId = "e501fe6c-78bb-432a-b3b2-cfab4d08e8f3";
const otherBranchId = "d74a189c-ef06-4797-a394-357d764680c3";
const alertId = "cff03ff7-988d-4caf-9cb4-26e5a84be327";
const productId = "c50b8962-58db-4efb-883f-4bb04af77873";
const timestamp = new Date("2026-01-01T00:00:00.000Z");
const actor: AuthenticatedUser = {
  id: actorId,
  name: "Test Storekeeper",
  email: "storekeeper@example.com",
  role: "STOREKEEPER",
  branchId,
  isActive: true,
};

function token(role: "ADMIN" | "MANAGER" | "STOREKEEPER") {
  return jwt.sign({ role, branchId }, secret, {
    subject: actorId,
    expiresIn: "1h",
  });
}

function setAuthenticatedUser(role: "ADMIN" | "MANAGER" | "STOREKEEPER") {
  userMocks.findUnique.mockResolvedValue({ ...actor, role });
}

function alertRecord(alertBranchId = branchId, isRead = false) {
  return {
    id: alertId,
    branchId: alertBranchId,
    productId,
    type: "LOW_STOCK",
    message: "USB-C Charger is low on stock (2 remaining).",
    isRead,
    resolvedAt: null,
    resolvedById: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    branch: { id: alertBranchId, name: "Colombo" },
    product: {
      id: productId,
      sku: "USB-C-01",
      name: "USB-C Charger",
      unit: "unit",
      reorderLevel: 5,
    },
  };
}

beforeEach(() => {
  resetSalesMocks();
});

describe("low-stock alert API and reconciliation", () => {
  it("documents low-stock listing and acknowledgement", () => {
    const specification = JSON.stringify(openApiSpec);
    expect(specification).toContain("/alerts/low-stock");
    expect(specification).toContain("/alerts/{id}/acknowledge");
  });

  it("filters active alerts and scopes a manager to their assigned branch", async () => {
    setAuthenticatedUser("MANAGER");
    alertMocks.findMany.mockResolvedValue([alertRecord()]);
    alertMocks.count.mockResolvedValue(1);

    await request(app)
      .get(
        `/alerts/low-stock?branchId=${branchId}&acknowledged=false&page=2&limit=5&sortBy=updatedAt&sortOrder=asc`,
      )
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.alerts).toHaveLength(1);
        expect(body.pagination).toEqual({
          page: 2,
          limit: 5,
          total: 1,
          totalPages: 1,
        });
      });

    expect(alertMocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: "LOW_STOCK",
          resolvedAt: null,
          branchId,
          isRead: false,
        },
        orderBy: { updatedAt: "asc" },
        skip: 5,
        take: 5,
      }),
    );

    await request(app)
      .get(`/alerts/low-stock?branchId=${otherBranchId}`)
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .expect(403);
    expect(alertMocks.findMany).toHaveBeenCalledTimes(1);
  });

  it("allows admins to filter alerts across branches", async () => {
    setAuthenticatedUser("ADMIN");
    alertMocks.findMany.mockResolvedValue([]);
    alertMocks.count.mockResolvedValue(0);

    await request(app)
      .get(`/alerts/low-stock?branchId=${otherBranchId}&acknowledged=true`)
      .set("Authorization", `Bearer ${token("ADMIN")}`)
      .expect(200);
    expect(alertMocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: "LOW_STOCK",
          resolvedAt: null,
          branchId: otherBranchId,
          isRead: true,
        },
      }),
    );
  });

  it("acknowledges an alert and writes before/after audit values", async () => {
    setAuthenticatedUser("STOREKEEPER");
    alertMocks.findUnique.mockResolvedValue(alertRecord());
    alertMocks.update.mockResolvedValue(alertRecord(branchId, true));

    await request(app)
      .patch(`/alerts/${alertId}/acknowledge`)
      .set("Authorization", `Bearer ${token("STOREKEEPER")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.alert.isRead).toBe(true);
      });

    expect(alertMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: alertId },
        data: { isRead: true },
      }),
    );
    expect(auditMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "UPDATE",
          entity: "Alert",
          entityId: alertId,
          before: expect.objectContaining({ isRead: false }),
          after: expect.objectContaining({ isRead: true }),
          ip: expect.any(String),
        }),
      }),
    );
  });

  it("prevents acknowledging another branch's alert", async () => {
    setAuthenticatedUser("STOREKEEPER");
    alertMocks.findUnique.mockResolvedValue(alertRecord(otherBranchId));

    await request(app)
      .patch(`/alerts/${alertId}/acknowledge`)
      .set("Authorization", `Bearer ${token("STOREKEEPER")}`)
      .expect(403);
    expect(alertMocks.update).not.toHaveBeenCalled();
    expect(auditMocks.create).not.toHaveBeenCalled();
  });

  it("reconciles all stock rows against reorder levels", async () => {
    stockMocks.findMany.mockResolvedValue([
      {
        branchId,
        productId,
        quantity: 2,
        product: { id: productId, name: "USB-C Charger", reorderLevel: 5 },
      },
      {
        branchId: otherBranchId,
        productId,
        quantity: 8,
        product: { id: productId, name: "USB-C Charger", reorderLevel: 5 },
      },
    ]);
    alertMocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(refreshAllLowStockAlerts()).resolves.toEqual({
      checked: 2,
      lowStock: 1,
      resolved: 1,
    });
    expect(alertMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          branchId_productId_type: {
            branchId,
            productId,
            type: "LOW_STOCK",
          },
        },
        update: {
          message: "USB-C Charger is low on stock (2 remaining).",
          isRead: false,
          resolvedAt: null,
          resolvedById: null,
        },
      }),
    );
    expect(alertMocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          branchId: otherBranchId,
          productId,
          type: "LOW_STOCK",
          resolvedAt: null,
        },
        data: {
          isRead: true,
          resolvedById: null,
          resolvedAt: expect.any(Date),
        },
      }),
    );
  });
});
