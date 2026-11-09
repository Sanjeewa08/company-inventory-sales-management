import jwt from "jsonwebtoken";
import request from "supertest";
import { Prisma } from "../src/generated/prisma/client";
import type { AuthenticatedUser } from "../src/middleware/authenticate";
import { openApiSpec } from "../src/swagger";
import {
  acceptQuotation,
  expireQuotation,
  prepareInvoicePayloadFromQuotation,
  sendQuotation,
  updateQuotation,
} from "../src/modules/quotations/quotations.service";
import {
  auditMocks,
  branchMocks,
  customerMocks,
  documentSequenceMocks,
  productMocks,
  quotationMocks,
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
const otherBranchId = "d74a189c-ef06-4797-a394-357d764680c3";
const customerId = "197b1597-ef44-40dd-a4e8-a4c4a06f84e8";
const productId = "c50b8962-58db-4efb-883f-4bb04af77873";
const quotationId = "cfd6a44f-0343-4f20-875b-995e9b5b7376";
const timestamp = new Date("2026-01-01T00:00:00.000Z");
const validUntil = new Date("2099-12-31T23:59:59.000Z");
const salesUser: AuthenticatedUser = {
  id: actorId,
  name: "Test Sales",
  email: "sales@example.com",
  role: "SALES",
  branchId,
  isActive: true,
};
function token(role: "SALES" | "MANAGER" | "ADMIN" | "STOREKEEPER") {
  return jwt.sign({ role, branchId }, secret, {
    subject: actorId,
    expiresIn: "1h",
  });
}

function setAuthenticatedUser(
  role: "SALES" | "MANAGER" | "ADMIN" | "STOREKEEPER",
) {
  userMocks.findUnique.mockResolvedValue({
    ...salesUser,
    role,
  });
}

function customer(
  overrides: Partial<{
    id: string;
    name: string;
    email: string | null;
    isActive: boolean;
  }> = {},
) {
  return {
    id: customerId,
    name: "Serendib Imports",
    email: "buyer@example.com",
    phone: "+94112223344",
    address: "Colombo",
    taxNumber: "TAX-123",
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function quotation(
  status: "DRAFT" | "SENT" | "ACCEPTED" | "EXPIRED" | "REJECTED" = "DRAFT",
  quotationBranchId = branchId,
  quotationValidUntil: Date | null = validUntil,
) {
  return {
    id: quotationId,
    number: "QT-2026-0001",
    customerId,
    branchId: quotationBranchId,
    createdById: actorId,
    status,
    issuedAt: timestamp,
    validUntil: quotationValidUntil,
    notes: "Delivery within one week",
    subtotal: new Prisma.Decimal("25.00"),
    tax: new Prisma.Decimal("2.00"),
    total: new Prisma.Decimal("27.00"),
    createdAt: timestamp,
    updatedAt: timestamp,
    customer: {
      id: customerId,
      name: "Serendib Imports",
      email: "buyer@example.com",
      phone: "+94112223344",
    },
    branch: { id: quotationBranchId, name: "Colombo" },
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
        },
      },
    ],
  };
}

beforeEach(() => {
  resetSalesMocks();
});

describe("customer management", () => {
  it("documents customer, quotation, and conversion routes in Swagger", () => {
    const specification = JSON.stringify(openApiSpec);
    expect(specification).toContain("/customers");
    expect(specification).toContain("/quotations/{id}/send");
    expect(specification).toContain("/quotations/{id}/convert");
    expect(specification).not.toContain("/invoices");
  });

  it("searches customers with pagination and sorting", async () => {
    setAuthenticatedUser("SALES");
    customerMocks.findMany.mockResolvedValue([customer()]);
    customerMocks.count.mockResolvedValue(1);

    await request(app)
      .get(
        "/customers?search=serendib&page=1&limit=10&sortBy=name&sortOrder=asc",
      )
      .set("Authorization", `Bearer ${token("SALES")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.customers).toHaveLength(1);
        expect(body.pagination).toMatchObject({
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        });
      });
    expect(customerMocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          OR: expect.arrayContaining([
            { name: { contains: "serendib", mode: "insensitive" } },
          ]),
        }),
        orderBy: { name: "asc" },
        skip: 0,
        take: 10,
      }),
    );
  });

  it("creates, updates, and deactivates customers with audit records", async () => {
    setAuthenticatedUser("MANAGER");
    const created = customer();
    customerMocks.create.mockResolvedValue(created);
    customerMocks.findUnique.mockResolvedValue(created);
    customerMocks.update
      .mockResolvedValueOnce({ ...created, name: "Serendib Retail" })
      .mockResolvedValueOnce({ ...created, isActive: false });

    await request(app)
      .post("/customers")
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .send({ name: "Serendib Imports", email: "BUYER@example.com" })
      .expect(201)
      .expect(({ body }) => {
        expect(body.customer.id).toBe(customerId);
      });
    expect(customerMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "buyer@example.com" }),
      }),
    );

    customerMocks.findUnique.mockResolvedValue(created);
    await request(app)
      .get(`/customers/${customerId}`)
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.customer.name).toBe("Serendib Imports");
      });

    await request(app)
      .patch(`/customers/${customerId}`)
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .send({ name: "Serendib Retail" })
      .expect(200);
    await request(app)
      .delete(`/customers/${customerId}`)
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.customer.isActive).toBe(false);
      });
    expect(customerMocks.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
    expect(auditMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "DELETE",
          entity: "Customer",
          before: expect.any(Object),
          after: expect.any(Object),
          ip: expect.any(String),
        }),
      }),
    );
  });

  it("requires authentication and the sales, manager, or admin role", async () => {
    await request(app).get("/customers").expect(401);

    setAuthenticatedUser("STOREKEEPER");
    await request(app)
      .get("/customers")
      .set("Authorization", `Bearer ${token("STOREKEEPER")}`)
      .expect(403);

    setAuthenticatedUser("SALES");
    await request(app)
      .post("/customers")
      .set("Authorization", `Bearer ${token("SALES")}`)
      .send({ name: "", email: "not-an-email" })
      .expect(400);
    expect(customerMocks.create).not.toHaveBeenCalled();
  });
});

describe("quotation management", () => {
  it("creates a draft quotation with decimal totals and a transactional QT number", async () => {
    setAuthenticatedUser("SALES");
    branchMocks.findFirst.mockResolvedValue({ id: branchId });
    customerMocks.findFirst.mockResolvedValue({ id: customerId });
    productMocks.findMany.mockResolvedValue([{ id: productId }]);
    documentSequenceMocks.upsert.mockResolvedValue({ nextValue: 2 });
    quotationMocks.create.mockResolvedValue(quotation());

    await request(app)
      .post("/quotations")
      .set("Authorization", `Bearer ${token("SALES")}`)
      .send({
        customerId,
        branchId,
        validUntil: validUntil.toISOString(),
        tax: "2.00",
        items: [{ productId, quantity: 2, unitPrice: "12.50" }],
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.quotation.status).toBe("DRAFT");
        expect(body.quotation.number).toMatch(/^QT-\d{4}-0001$/);
        expect(body.quotation.total).toBe("27");
      });
    expect(documentSequenceMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type_year: {
            type: "QUOTATION",
            year: new Date().getFullYear(),
          },
        },
        update: { nextValue: { increment: 1 } },
      }),
    );
    expect(quotationMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: new Prisma.Decimal("25"),
          tax: new Prisma.Decimal("2"),
          total: new Prisma.Decimal("27"),
          items: {
            create: [
              expect.objectContaining({
                quantity: 2,
                unitPrice: new Prisma.Decimal("12.5"),
                lineTotal: new Prisma.Decimal("25"),
              }),
            ],
          },
        }),
      }),
    );
    expect(auditMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE",
          entity: "Quotation",
          after: expect.any(Object),
          ip: expect.any(String),
        }),
      }),
    );
  });

  it("lists sales quotations only for the caller's branch", async () => {
    setAuthenticatedUser("SALES");
    quotationMocks.findMany.mockResolvedValue([quotation()]);
    quotationMocks.count.mockResolvedValue(1);

    await request(app)
      .get("/quotations?status=DRAFT&page=1&limit=5")
      .set("Authorization", `Bearer ${token("SALES")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.quotations).toHaveLength(1);
        expect(body.pagination.totalPages).toBe(1);
      });
    expect(quotationMocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId, status: "DRAFT" }),
      }),
    );

    quotationMocks.findUnique.mockResolvedValue(quotation());
    await request(app)
      .get(`/quotations/${quotationId}`)
      .set("Authorization", `Bearer ${token("SALES")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.quotation.number).toBe("QT-2026-0001");
      });

    setAuthenticatedUser("MANAGER");
    await request(app)
      .get(`/quotations?branchId=${otherBranchId}`)
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .expect(200);
    expect(quotationMocks.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: otherBranchId }),
      }),
    );
  });

  it("sends and accepts a quotation, then prepares invoice input without creating an invoice", async () => {
    setAuthenticatedUser("SALES");
    const draft = quotation("DRAFT");
    const sent = quotation("SENT");
    const accepted = quotation("ACCEPTED");
    quotationMocks.findUnique
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(sent)
      .mockResolvedValueOnce(accepted);
    quotationMocks.findUniqueOrThrow
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(sent);
    quotationMocks.updateMany.mockResolvedValue({ count: 1 });
    quotationMocks.update
      .mockResolvedValueOnce(sent)
      .mockResolvedValueOnce(accepted);

    const sentQuotation = await sendQuotation(
      quotationId,
      salesUser,
      "127.0.0.1",
    );
    expect(sentQuotation.status).toBe("SENT");
    const acceptedQuotation = await acceptQuotation(
      quotationId,
      salesUser,
      "127.0.0.1",
    );
    expect(acceptedQuotation.status).toBe("ACCEPTED");

    const invoicePayload = await prepareInvoicePayloadFromQuotation(
      quotationId,
      salesUser,
    );
    expect(invoicePayload).toMatchObject({
      quotationId,
      customerId,
      branchId,
      dueAt: null,
      subtotal: "25",
      tax: "2",
      total: "27",
      items: [{ productId, quantity: 2, unitPrice: "12.5" }],
    });
    expect(quotationMocks.update).toHaveBeenCalledTimes(2);
    expect(auditMocks.create).toHaveBeenCalledTimes(2);
  });

  it("allows quotation updates only while the quotation is a draft", async () => {
    quotationMocks.findUnique.mockResolvedValue(quotation("SENT"));

    await expect(
      updateQuotation(
        quotationId,
        { notes: "Changed after sending" },
        salesUser,
        "127.0.0.1",
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "QUOTATION_NOT_DRAFT",
    });
    expect(quotationMocks.update).not.toHaveBeenCalled();
  });

  it("updates a draft quotation and audits its before/after state", async () => {
    const before = quotation("DRAFT");
    const after = { ...before, notes: "Updated quote" };
    quotationMocks.findUnique.mockResolvedValue(before);
    quotationMocks.updateMany.mockResolvedValue({ count: 1 });
    quotationMocks.findUniqueOrThrow
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);

    await updateQuotation(
      quotationId,
      { notes: "Updated quote" },
      salesUser,
      "127.0.0.1",
    );

    expect(quotationMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notes: "Updated quote" }),
      }),
    );
    expect(auditMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "UPDATE",
          entity: "Quotation",
          before: expect.any(Object),
          after: expect.any(Object),
        }),
      }),
    );
  });

  it("expires sent quotations and refuses updates or acceptance in invalid states", async () => {
    setAuthenticatedUser("SALES");
    const sent = quotation("SENT");
    quotationMocks.findUnique
      .mockResolvedValueOnce(quotation("SENT"))
      .mockResolvedValueOnce(quotation("DRAFT"));
    quotationMocks.findUniqueOrThrow.mockResolvedValueOnce(sent);
    quotationMocks.updateMany.mockResolvedValue({ count: 1 });
    quotationMocks.update.mockResolvedValueOnce(quotation("EXPIRED"));

    const expired = await expireQuotation(quotationId, salesUser, "127.0.0.1");
    expect(expired.status).toBe("EXPIRED");

    await expect(
      acceptQuotation(quotationId, salesUser, "127.0.0.1"),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "QUOTATION_INVALID_STATUS",
    });
    expect(quotationMocks.update).toHaveBeenCalledTimes(1);
  });

  it("rejects expired quotations and keeps sales users within their branch", async () => {
    setAuthenticatedUser("SALES");
    const expiredSent = quotation(
      "SENT",
      branchId,
      new Date("2020-01-01T00:00:00.000Z"),
    );
    quotationMocks.findUnique.mockResolvedValue(expiredSent);
    quotationMocks.findUniqueOrThrow.mockResolvedValue(expiredSent);
    quotationMocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      acceptQuotation(quotationId, salesUser, "127.0.0.1"),
    ).rejects.toMatchObject({ statusCode: 409, code: "QUOTATION_EXPIRED" });
    expect(quotationMocks.update).not.toHaveBeenCalled();

    quotationMocks.findUnique.mockResolvedValue(
      quotation("DRAFT", otherBranchId),
    );
    await request(app)
      .get(`/quotations/${quotationId}`)
      .set("Authorization", `Bearer ${token("SALES")}`)
      .expect(403);
  });

  it("rejects quotation creation for a different sales branch and protects roles", async () => {
    setAuthenticatedUser("SALES");
    await request(app)
      .post("/quotations")
      .set("Authorization", `Bearer ${token("SALES")}`)
      .send({
        customerId,
        branchId: otherBranchId,
        items: [{ productId, quantity: 1, unitPrice: "10.00" }],
      })
      .expect(403);
    expect(quotationMocks.create).not.toHaveBeenCalled();

    setAuthenticatedUser("STOREKEEPER");
    await request(app)
      .get("/quotations")
      .set("Authorization", `Bearer ${token("STOREKEEPER")}`)
      .expect(403);
  });
});
