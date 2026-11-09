import jwt from "jsonwebtoken";
import request from "supertest";
import { Prisma } from "../src/generated/prisma/client";
import type { AuthenticatedUser } from "../src/middleware/authenticate";
import {
  reportMocks,
  resetSalesMocks,
  userMocks,
} from "./support/sales-prisma-mock";

jest.mock("../src/prisma/client", () => ({
  prisma: jest.requireActual("./support/sales-prisma-mock").salesPrismaMock,
}));

import { app } from "../src/app";
import { openApiSpec } from "../src/swagger";

const secret = process.env.JWT_SECRET!;
const actorId = "d4f79285-4be7-4c54-95a7-143268b8474c";
const branchId = "e501fe6c-78bb-432a-b3b2-cfab4d08e8f3";
const otherBranchId = "d74a189c-ef06-4797-a394-357d764680c3";
const productId = "c50b8962-58db-4efb-883f-4bb04af77873";
const customerId = "197b1597-ef44-40dd-a4e8-a4c4a06f84e8";
const invoiceId = "cfd6a44f-0343-4f20-875b-995e9b5b7376";
const timestamp = new Date("2026-03-15T12:00:00.000Z");
const actor: AuthenticatedUser = {
  id: actorId,
  name: "Test Accountant",
  email: "accountant@example.com",
  role: "ACCOUNTANT",
  branchId,
  isActive: true,
};

function token(role: "ADMIN" | "MANAGER" | "ACCOUNTANT" | "SALES") {
  return jwt.sign({ role, branchId }, secret, {
    subject: actorId,
    expiresIn: "1h",
  });
}

function setAuthenticatedUser(
  role: "ADMIN" | "MANAGER" | "ACCOUNTANT" | "SALES",
) {
  userMocks.findUnique.mockResolvedValue({ ...actor, role });
}

beforeEach(() => {
  resetSalesMocks();
});

describe("reports API", () => {
  it("documents all report routes", () => {
    const specification = JSON.stringify(openApiSpec);
    expect(specification).toContain("/reports/sales");
    expect(specification).toContain("/reports/stock-valuation");
    expect(specification).toContain("/reports/top-products");
    expect(specification).toContain("/reports/branch-comparison");
    expect(specification).toContain("/reports/outstanding-payments");
  });

  it("returns Decimal-safe sales totals by month and excludes cancelled invoices", async () => {
    setAuthenticatedUser("ACCOUNTANT");
    reportMocks.queryRaw.mockResolvedValue([
      {
        period: new Date("2026-03-01T00:00:00.000Z"),
        invoiceCount: 2n,
        subtotal: new Prisma.Decimal("250.50"),
        discount: new Prisma.Decimal("10.25"),
        tax: new Prisma.Decimal("20.02"),
        total: new Prisma.Decimal("260.27"),
      },
    ]);

    await request(app)
      .get(
        `/reports/sales?from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.999Z&groupBy=month&branchId=${branchId}`,
      )
      .set("Authorization", `Bearer ${token("ACCOUNTANT")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.sales).toEqual([
          {
            period: "2026-03-01T00:00:00.000Z",
            count: 2,
            subtotal: "250.50",
            discount: "10.25",
            tax: "20.02",
            total: "260.27",
          },
        ]);
      });

    expect(reportMocks.queryRaw).toHaveBeenCalledTimes(1);
    const query = reportMocks.queryRaw.mock.calls[0][0];
    expect(JSON.stringify(query)).toContain("CANCELLED");
  });

  it("calculates valuation per branch and grand totals without floating-point sums", async () => {
    setAuthenticatedUser("ACCOUNTANT");
    reportMocks.queryRaw.mockResolvedValue([
      {
        branchId,
        branchName: "Colombo",
        productId,
        sku: "USB-C-01",
        productName: "USB-C Charger",
        quantity: 3,
        costPrice: new Prisma.Decimal("12.35"),
      },
      {
        branchId: otherBranchId,
        branchName: "Kandy",
        productId: "e8b3c781-45ee-4d24-8ff1-fc4cdb0fb077",
        sku: "HDMI-01",
        productName: "HDMI Cable",
        quantity: 2,
        costPrice: new Prisma.Decimal("9.99"),
      },
      {
        branchId: "b2b7dff4-c754-41c9-b687-7b09c3b9ab03",
        branchName: "Negombo",
        productId: null,
        sku: null,
        productName: null,
        quantity: null,
        costPrice: null,
      },
    ]);

    await request(app)
      .get("/reports/stock-valuation")
      .set("Authorization", `Bearer ${token("ACCOUNTANT")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.stockValuation.branches).toEqual([
          {
            branchId,
            branchName: "Colombo",
            products: [
              {
                productId,
                sku: "USB-C-01",
                name: "USB-C Charger",
                quantity: 3,
                costPrice: "12.35",
                stockValue: "37.05",
              },
            ],
            totalQuantity: 3,
            totalValue: "37.05",
          },
          {
            branchId: otherBranchId,
            branchName: "Kandy",
            products: [
              {
                productId: "e8b3c781-45ee-4d24-8ff1-fc4cdb0fb077",
                sku: "HDMI-01",
                name: "HDMI Cable",
                quantity: 2,
                costPrice: "9.99",
                stockValue: "19.98",
              },
            ],
            totalQuantity: 2,
            totalValue: "19.98",
          },
          {
            branchId: "b2b7dff4-c754-41c9-b687-7b09c3b9ab03",
            branchName: "Negombo",
            products: [],
            totalQuantity: 0,
            totalValue: "0.00",
          },
        ]);
        expect(body.stockValuation.grandTotal).toEqual({
          quantity: 5,
          value: "57.03",
        });
      });
  });

  it("returns top products by quantity and revenue", async () => {
    setAuthenticatedUser("MANAGER");
    reportMocks.queryRaw.mockResolvedValue([
      {
        productId,
        sku: "USB-C-01",
        name: "USB-C Charger",
        quantity: 8n,
        revenue: new Prisma.Decimal("199.92"),
      },
      {
        productId: "e8b3c781-45ee-4d24-8ff1-fc4cdb0fb077",
        sku: "HDMI-01",
        name: "HDMI Cable",
        quantity: 3n,
        revenue: new Prisma.Decimal("45.00"),
      },
    ]);

    await request(app)
      .get(
        `/reports/top-products?from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.999Z&limit=2&branchId=${branchId}`,
      )
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.products).toEqual([
          {
            productId,
            sku: "USB-C-01",
            name: "USB-C Charger",
            quantity: 8,
            revenue: "199.92",
          },
          {
            productId: "e8b3c781-45ee-4d24-8ff1-fc4cdb0fb077",
            sku: "HDMI-01",
            name: "HDMI Cable",
            quantity: 3,
            revenue: "45.00",
          },
        ]);
      });
  });

  it("compares branch sales, invoice counts, and stock values", async () => {
    setAuthenticatedUser("ADMIN");
    reportMocks.queryRaw.mockResolvedValue([
      {
        branchId,
        branchName: "Colombo",
        invoiceCount: 5n,
        salesTotal: new Prisma.Decimal("1250.75"),
        stockValue: new Prisma.Decimal("510.50"),
      },
      {
        branchId: otherBranchId,
        branchName: "Kandy",
        invoiceCount: 0n,
        salesTotal: new Prisma.Decimal("0"),
        stockValue: new Prisma.Decimal("19.98"),
      },
    ]);

    await request(app)
      .get(
        "/reports/branch-comparison?from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.999Z",
      )
      .set("Authorization", `Bearer ${token("ADMIN")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.branches).toEqual([
          {
            branchId,
            branchName: "Colombo",
            salesTotal: "1250.75",
            invoiceCount: 5,
            stockValue: "510.50",
          },
          {
            branchId: otherBranchId,
            branchName: "Kandy",
            salesTotal: "0.00",
            invoiceCount: 0,
            stockValue: "19.98",
          },
        ]);
      });
  });

  it("reports outstanding balances and invoice age", async () => {
    setAuthenticatedUser("ACCOUNTANT");
    reportMocks.queryRaw.mockResolvedValue([
      {
        invoiceId,
        invoiceNumber: "INV-2026-0001",
        status: "PARTIAL",
        issuedAt: timestamp,
        dueAt: new Date("2026-04-15T00:00:00.000Z"),
        customerId,
        customerName: "Serendib Imports",
        branchId,
        branchName: "Colombo",
        total: new Prisma.Decimal("240.00"),
        paidAmount: new Prisma.Decimal("90.00"),
        balanceDue: new Prisma.Decimal("150.00"),
        ageDays: 12,
      },
    ]);

    await request(app)
      .get(`/reports/outstanding-payments?branchId=${branchId}`)
      .set("Authorization", `Bearer ${token("ACCOUNTANT")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.invoices).toEqual([
          {
            invoiceId,
            invoiceNumber: "INV-2026-0001",
            status: "PARTIAL",
            issuedAt: timestamp.toISOString(),
            dueAt: "2026-04-15T00:00:00.000Z",
            customerId,
            customerName: "Serendib Imports",
            branchId,
            branchName: "Colombo",
            total: "240.00",
            paidAmount: "90.00",
            balanceDue: "150.00",
            ageDays: 12,
          },
        ]);
      });
  });

  it("restricts branch comparison and top products to managers and admins", async () => {
    setAuthenticatedUser("ACCOUNTANT");
    await request(app)
      .get(
        "/reports/branch-comparison?from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.999Z",
      )
      .set("Authorization", `Bearer ${token("ACCOUNTANT")}`)
      .expect(403);
    await request(app)
      .get(
        "/reports/top-products?from=2026-03-01T00:00:00.000Z&to=2026-03-31T23:59:59.999Z",
      )
      .set("Authorization", `Bearer ${token("ACCOUNTANT")}`)
      .expect(403);

    setAuthenticatedUser("SALES");
    await request(app)
      .get("/reports/stock-valuation")
      .set("Authorization", `Bearer ${token("SALES")}`)
      .expect(403);
    expect(reportMocks.queryRaw).not.toHaveBeenCalled();
  });

  it("rejects missing or reversed report date ranges", async () => {
    setAuthenticatedUser("MANAGER");
    await request(app)
      .get("/reports/sales")
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .expect(400);
    await request(app)
      .get(
        "/reports/top-products?from=2026-04-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z",
      )
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .expect(400);
    expect(reportMocks.queryRaw).not.toHaveBeenCalled();
  });
});
