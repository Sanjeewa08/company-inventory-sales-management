import jwt from "jsonwebtoken";
import request from "supertest";
import { Prisma } from "../src/generated/prisma/client";
import type { AuthenticatedUser } from "../src/middleware/authenticate";
import { openApiSpec } from "../src/swagger";
import {
  alertMocks,
  auditMocks,
  branchMocks,
  customerMocks,
  documentSequenceMocks,
  invoiceMocks,
  paymentMocks,
  productMocks,
  quotationMocks,
  resetSalesMocks,
  stockMocks,
  stockMovementMocks,
  userMocks,
} from "./support/sales-prisma-mock";

jest.mock("../src/prisma/client", () => ({
  prisma: jest.requireActual("./support/sales-prisma-mock").salesPrismaMock,
}));

import { app } from "../src/app";

const secret = process.env.JWT_SECRET!;
const actorId = "d4f79285-4be7-4c54-95a7-143268b8474c";
const branchId = "e501fe6c-78bb-432a-b3b2-cfab4d08e8f3";
const otherBranchId = "d74a189c-ef06-4797-a394-357d764680c3";
const customerId = "197b1597-ef44-40dd-a4e8-a4c4a06f84e8";
const productId = "c50b8962-58db-4efb-883f-4bb04af77873";
const invoiceId = "cfd6a44f-0343-4f20-875b-995e9b5b7376";
const quotationId = "5a1b19b1-e1db-4b9d-91cd-7bc57605fc51";
const timestamp = new Date("2026-01-01T00:00:00.000Z");
const actor: AuthenticatedUser = {
  id: actorId,
  name: "Test Sales",
  email: "sales@example.com",
  role: "SALES",
  branchId,
  isActive: true,
};

function token(role: "SALES" | "MANAGER" | "ADMIN" | "ACCOUNTANT") {
  return jwt.sign({ role, branchId }, secret, {
    subject: actorId,
    expiresIn: "1h",
  });
}

function setAuthenticatedUser(
  role: "SALES" | "MANAGER" | "ADMIN" | "ACCOUNTANT",
) {
  userMocks.findUnique.mockResolvedValue({
    ...actor,
    role,
  });
}

function invoiceRecord(
  status: "PENDING" | "PARTIAL" | "PAID" | "CANCELLED" = "PENDING",
  invoiceBranchId = branchId,
  sourceQuotationId: string | null = null,
  discount = "3.00",
) {
  return {
    id: invoiceId,
    number: "INV-2026-0001",
    customerId,
    branchId: invoiceBranchId,
    quotationId: sourceQuotationId,
    createdById: actorId,
    status,
    issuedAt: timestamp,
    dueAt: null,
    notes: "Customer requested delivery",
    subtotal: new Prisma.Decimal("25.00"),
    discount: new Prisma.Decimal(discount),
    tax: new Prisma.Decimal("2.00"),
    total: new Prisma.Decimal("24.00"),
    createdAt: timestamp,
    updatedAt: timestamp,
    customer: {
      id: customerId,
      name: "Serendib Imports",
      email: "buyer@example.com",
      phone: "+94112223344",
    },
    branch: { id: invoiceBranchId, name: "Colombo" },
    items: [
      {
        id: "c682a9d8-68d9-4eb6-89bf-898c52cf0fc6",
        productId,
        quantity: 2,
        unitPrice: new Prisma.Decimal("12.50"),
        lineTotal: new Prisma.Decimal("25.00"),
        product: {
          id: productId,
          sku: "ELE-001",
          name: "USB-C Charger",
          unit: "unit",
          reorderLevel: 3,
        },
      },
    ],
  };
}

function acceptedQuotation(quotationBranchId = branchId) {
  return {
    id: quotationId,
    number: "QT-2026-0001",
    customerId,
    branchId: quotationBranchId,
    status: "ACCEPTED",
    notes: "Accepted quote",
    subtotal: new Prisma.Decimal("25.00"),
    tax: new Prisma.Decimal("2.00"),
    total: new Prisma.Decimal("27.00"),
    items: [
      {
        productId,
        quantity: 2,
        unitPrice: new Prisma.Decimal("12.50"),
      },
    ],
  };
}

const manualInvoiceInput = {
  customerId,
  branchId,
  notes: "Customer requested delivery",
  discount: "3.00",
  tax: "2.00",
  items: [{ productId, quantity: 2, unitPrice: "12.50" }],
};

beforeEach(() => {
  resetSalesMocks();
});

describe("invoice API", () => {
  it("documents invoice routes without payment or PDF endpoints", () => {
    const specification = JSON.stringify(openApiSpec);
    expect(specification).toContain("/invoices");
    expect(specification).toContain("/invoices/{id}/cancel");
    expect(specification).not.toContain("/payments");
    expect(specification).not.toContain("/invoices/{id}/pdf");
  });

  it("creates an invoice, deducts stock, writes SALE movement, and refreshes alerts", async () => {
    setAuthenticatedUser("SALES");
    customerMocks.findFirst.mockResolvedValue({ id: customerId });
    branchMocks.findFirst.mockResolvedValue({ id: branchId });
    productMocks.findMany.mockResolvedValue([
      { id: productId, name: "USB-C Charger", reorderLevel: 3 },
    ]);
    stockMocks.findMany.mockResolvedValue([{ productId, quantity: 5 }]);
    documentSequenceMocks.upsert.mockResolvedValue({ nextValue: 2 });
    invoiceMocks.create.mockResolvedValue(invoiceRecord());
    stockMocks.updateMany.mockResolvedValue({ count: 1 });
    stockMocks.findUniqueOrThrow.mockResolvedValue({ quantity: 3 });
    alertMocks.upsert.mockResolvedValue(null);

    await request(app)
      .post("/invoices")
      .set("Authorization", `Bearer ${token("SALES")}`)
      .send(manualInvoiceInput)
      .expect(201)
      .expect(({ body }) => {
        expect(body.invoice.status).toBe("PENDING");
        expect(body.invoice.number).toMatch(/^INV-\d{4}-0001$/);
        expect(body.invoice.discount).toBe("3");
        expect(body.invoice.total).toBe("24");
      });

    expect(documentSequenceMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type_year: {
            type: "INVOICE",
            year: new Date().getFullYear(),
          },
        },
        update: { nextValue: { increment: 1 } },
      }),
    );
    expect(invoiceMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          subtotal: new Prisma.Decimal("25"),
          discount: new Prisma.Decimal("3"),
          tax: new Prisma.Decimal("2"),
          total: new Prisma.Decimal("24"),
        }),
      }),
    );
    expect(stockMocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productId,
          branchId,
          quantity: { gte: 2 },
        },
        data: { quantity: { decrement: 2 } },
      }),
    );
    expect(stockMovementMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "SALE",
          quantity: 2,
          referenceType: "Invoice",
          referenceId: invoiceId,
        }),
      }),
    );
    expect(alertMocks.upsert).toHaveBeenCalled();
    expect(auditMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE",
          entity: "Invoice",
          after: expect.any(Object),
          ip: expect.any(String),
        }),
      }),
    );
  });

  it("does not write anything when preflight stock is insufficient", async () => {
    setAuthenticatedUser("SALES");
    customerMocks.findFirst.mockResolvedValue({ id: customerId });
    branchMocks.findFirst.mockResolvedValue({ id: branchId });
    productMocks.findMany.mockResolvedValue([
      { id: productId, name: "USB-C Charger", reorderLevel: 3 },
    ]);
    stockMocks.findMany.mockResolvedValue([{ productId, quantity: 1 }]);

    await request(app)
      .post("/invoices")
      .set("Authorization", `Bearer ${token("SALES")}`)
      .send(manualInvoiceInput)
      .expect(400)
      .expect(({ body }) => {
        expect(body.error.code).toBe("INSUFFICIENT_STOCK");
      });

    expect(documentSequenceMocks.upsert).not.toHaveBeenCalled();
    expect(invoiceMocks.create).not.toHaveBeenCalled();
    expect(stockMocks.updateMany).not.toHaveBeenCalled();
    expect(stockMovementMocks.create).not.toHaveBeenCalled();
    expect(alertMocks.upsert).not.toHaveBeenCalled();
    expect(auditMocks.create).not.toHaveBeenCalled();
  });

  it("restores stock and writes RETURN movement when cancelling an unpaid invoice", async () => {
    setAuthenticatedUser("SALES");
    invoiceMocks.findUnique.mockResolvedValue({
      id: invoiceId,
      branchId,
      status: "PENDING",
    });
    invoiceMocks.updateMany.mockResolvedValue({ count: 1 });
    invoiceMocks.findUniqueOrThrow.mockResolvedValue(invoiceRecord());
    paymentMocks.count.mockResolvedValue(0);
    stockMocks.upsert.mockResolvedValue({ quantity: 4 });
    alertMocks.updateMany.mockResolvedValue({ count: 1 });
    invoiceMocks.update.mockResolvedValue(invoiceRecord("CANCELLED"));

    await request(app)
      .post(`/invoices/${invoiceId}/cancel`)
      .set("Authorization", `Bearer ${token("SALES")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.invoice.status).toBe("CANCELLED");
      });
    expect(stockMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId_branchId: { productId, branchId } },
        update: { quantity: { increment: 2 } },
      }),
    );
    expect(stockMovementMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "RETURN",
          quantity: 2,
          referenceId: invoiceId,
        }),
      }),
    );
    expect(invoiceMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "CANCELLED" } }),
    );
    expect(auditMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CANCEL",
          entity: "Invoice",
          before: expect.any(Object),
          after: expect.any(Object),
        }),
      }),
    );
  });

  it("refuses cancellation when an invoice has payments", async () => {
    setAuthenticatedUser("SALES");
    invoiceMocks.findUnique.mockResolvedValue({
      id: invoiceId,
      branchId,
      status: "PENDING",
    });
    invoiceMocks.updateMany.mockResolvedValue({ count: 1 });
    invoiceMocks.findUniqueOrThrow.mockResolvedValue(invoiceRecord());
    paymentMocks.count.mockResolvedValue(1);

    await request(app)
      .post(`/invoices/${invoiceId}/cancel`)
      .set("Authorization", `Bearer ${token("SALES")}`)
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe("INVOICE_HAS_PAYMENTS");
      });
    expect(stockMocks.upsert).not.toHaveBeenCalled();
    expect(stockMovementMocks.create).not.toHaveBeenCalled();
    expect(invoiceMocks.update).not.toHaveBeenCalled();
  });

  it("converts an accepted quotation, links it, and marks it converted", async () => {
    setAuthenticatedUser("SALES");
    const accepted = acceptedQuotation();
    customerMocks.findFirst.mockResolvedValue({ id: customerId });
    branchMocks.findFirst.mockResolvedValue({ id: branchId });
    productMocks.findMany.mockResolvedValue([
      { id: productId, name: "USB-C Charger", reorderLevel: 3 },
    ]);
    stockMocks.findMany.mockResolvedValue([{ productId, quantity: 5 }]);
    quotationMocks.findUnique.mockResolvedValue({
      id: quotationId,
      branchId,
      status: "ACCEPTED",
    });
    quotationMocks.updateMany.mockResolvedValue({ count: 1 });
    quotationMocks.findUniqueOrThrow.mockResolvedValue(accepted);
    quotationMocks.update.mockResolvedValue({
      id: quotationId,
      number: "QT-2026-0001",
      status: "CONVERTED",
    });
    documentSequenceMocks.upsert.mockResolvedValue({ nextValue: 2 });
    invoiceMocks.create.mockResolvedValue(
      invoiceRecord("PENDING", branchId, quotationId, "0.00"),
    );
    stockMocks.updateMany.mockResolvedValue({ count: 1 });
    stockMocks.findUniqueOrThrow.mockResolvedValue({ quantity: 3 });
    alertMocks.upsert.mockResolvedValue(null);

    await request(app)
      .post("/invoices")
      .set("Authorization", `Bearer ${token("SALES")}`)
      .send({ quotationId })
      .expect(201);

    expect(invoiceMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quotationId,
          discount: new Prisma.Decimal(0),
          tax: new Prisma.Decimal("2.00"),
          items: {
            create: [
              expect.objectContaining({
                productId,
                quantity: 2,
                unitPrice: new Prisma.Decimal("12.50"),
              }),
            ],
          },
        }),
      }),
    );
    expect(quotationMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "CONVERTED" },
      }),
    );
    expect(auditMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "Quotation",
          after: expect.objectContaining({
            invoiceId,
            status: "CONVERTED",
          }),
        }),
      }),
    );
  });

  it("lists invoices with filters and allows accountants read-only access", async () => {
    setAuthenticatedUser("ACCOUNTANT");
    invoiceMocks.findMany.mockResolvedValue([invoiceRecord()]);
    invoiceMocks.count.mockResolvedValue(1);

    await request(app)
      .get(
        `/invoices?status=PENDING&customerId=${customerId}&branchId=${branchId}&startDate=2026-01-01T00:00:00.000Z&endDate=2026-12-31T23:59:59.000Z&sortBy=total&sortOrder=asc`,
      )
      .set("Authorization", `Bearer ${token("ACCOUNTANT")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.invoices).toHaveLength(1);
        expect(body.pagination.total).toBe(1);
      });
    expect(invoiceMocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PENDING",
          customerId,
          branchId,
          issuedAt: {
            gte: new Date("2026-01-01T00:00:00.000Z"),
            lte: new Date("2026-12-31T23:59:59.000Z"),
          },
        }),
        orderBy: { total: "asc" },
      }),
    );

    invoiceMocks.findUnique.mockResolvedValue(invoiceRecord());
    await request(app)
      .get(`/invoices/${invoiceId}`)
      .set("Authorization", `Bearer ${token("ACCOUNTANT")}`)
      .expect(200);
    await request(app)
      .post("/invoices")
      .set("Authorization", `Bearer ${token("ACCOUNTANT")}`)
      .send(manualInvoiceInput)
      .expect(403);
    await request(app)
      .post(`/invoices/${invoiceId}/cancel`)
      .set("Authorization", `Bearer ${token("ACCOUNTANT")}`)
      .expect(403);
  });

  it("enforces sales branch access, rejects other roles, and validates invoice input", async () => {
    setAuthenticatedUser("SALES");
    await request(app)
      .post("/invoices")
      .set("Authorization", `Bearer ${token("SALES")}`)
      .send({ ...manualInvoiceInput, branchId: otherBranchId })
      .expect(403);
    expect(invoiceMocks.create).not.toHaveBeenCalled();

    setAuthenticatedUser("MANAGER");
    await request(app)
      .post("/invoices")
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .send({
        ...manualInvoiceInput,
        items: [{ productId, quantity: 0, unitPrice: "bad" }],
      })
      .expect(400);
    expect(invoiceMocks.create).not.toHaveBeenCalled();

    customerMocks.findFirst.mockResolvedValue({ id: customerId });
    branchMocks.findFirst.mockResolvedValue({ id: otherBranchId });
    productMocks.findMany.mockResolvedValue([
      { id: productId, name: "USB-C Charger", reorderLevel: 3 },
    ]);
    stockMocks.findMany.mockResolvedValue([{ productId, quantity: 5 }]);
    documentSequenceMocks.upsert.mockResolvedValue({ nextValue: 2 });
    invoiceMocks.create.mockResolvedValue(
      invoiceRecord("PENDING", otherBranchId),
    );
    stockMocks.updateMany.mockResolvedValue({ count: 1 });
    stockMocks.findUniqueOrThrow.mockResolvedValue({ quantity: 3 });
    alertMocks.upsert.mockResolvedValue(null);
    await request(app)
      .post("/invoices")
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .send({ ...manualInvoiceInput, branchId: otherBranchId })
      .expect(201);
    expect(invoiceMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ branchId: otherBranchId }),
      }),
    );

    setAuthenticatedUser("ACCOUNTANT");
    await request(app)
      .post("/invoices")
      .set("Authorization", `Bearer ${token("ACCOUNTANT")}`)
      .send(manualInvoiceInput)
      .expect(403);
  });
});
