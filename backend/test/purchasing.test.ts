import jwt from "jsonwebtoken";
import request from "supertest";
import { Prisma } from "../src/generated/prisma/client";
import type { AuthenticatedUser } from "../src/middleware/authenticate";
import { openApiSpec } from "../src/swagger";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
} from "../src/modules/purchase-orders/purchase-orders.service";
import {
  auditMocks,
  branchMocks,
  documentSequenceMocks,
  productMocks,
  purchaseOrderMocks,
  purchasingPrismaMock,
  resetPurchasingMocks,
  supplierMocks,
  userMocks,
} from "./support/purchasing-prisma-mock";

jest.mock("../src/prisma/client", () => ({
  prisma: jest.requireActual("./support/purchasing-prisma-mock")
    .purchasingPrismaMock,
}));

import { app } from "../src/app";

const secret = process.env.JWT_SECRET!;
const actorId = "d4f79285-4be7-4c54-95a7-143268b8474c";
const branchId = "e501fe6c-78bb-432a-b3b2-cfab4d08e8f3";
const supplierId = "197b1597-ef44-40dd-a4e8-a4c4a06f84e8";
const productId = "c50b8962-58db-4efb-883f-4bb04af77873";
const orderId = "cfd6a44f-0343-4f20-875b-995e9b5b7376";
const timestamp = new Date("2026-01-01T00:00:00.000Z");
const manager: AuthenticatedUser = {
  id: actorId,
  name: "Test Manager",
  email: "manager@example.com",
  role: "MANAGER",
  branchId,
  isActive: true,
};
const storekeeper: AuthenticatedUser = {
  ...manager,
  role: "STOREKEEPER",
};

function token(role: "ADMIN" | "MANAGER" | "STOREKEEPER") {
  return jwt.sign({ role, branchId }, secret, {
    subject: actorId,
    expiresIn: "1h",
  });
}

function setAuthenticatedUser(role: "ADMIN" | "MANAGER" | "STOREKEEPER") {
  userMocks.findUnique.mockResolvedValue({
    ...manager,
    role,
  });
}

function purchaseOrder(
  status: "DRAFT" | "APPROVED" | "CANCELLED" = "DRAFT",
  number = "PO-2026-0001",
) {
  return {
    id: orderId,
    number,
    supplierId,
    branchId,
    createdById: actorId,
    approvedById: status === "APPROVED" ? actorId : null,
    status,
    orderedAt: timestamp,
    expectedAt: null,
    approvedAt: status === "APPROVED" ? timestamp : null,
    notes: null,
    subtotal: new Prisma.Decimal("21.00"),
    tax: new Prisma.Decimal("1.00"),
    total: new Prisma.Decimal("22.00"),
    createdAt: timestamp,
    updatedAt: timestamp,
    supplier: { id: supplierId, name: "Lanka Tech", email: null },
    branch: { id: branchId, name: "Colombo" },
    items: [
      {
        id: "c682a9d8-68d9-4eb6-89bf-898c52cf0fc6",
        productId,
        quantity: 2,
        receivedQuantity: 0,
        unitCost: new Prisma.Decimal("10.50"),
        lineTotal: new Prisma.Decimal("21.00"),
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
  resetPurchasingMocks();
});

describe("supplier endpoints", () => {
  it("documents supplier and purchase-order routes in Swagger", () => {
    const specification = JSON.stringify(openApiSpec);
    expect(specification).toContain("/suppliers");
    expect(specification).toContain("/purchase-orders/{id}/approve");
    expect(specification).not.toContain("/goods-receipts");
  });

  it("searches suppliers with pagination and sorting", async () => {
    setAuthenticatedUser("MANAGER");
    supplierMocks.findMany.mockResolvedValue([
      {
        id: supplierId,
        name: "Lanka Tech",
        contactName: null,
        email: "sales@example.com",
        phone: null,
        address: null,
        taxNumber: null,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);
    supplierMocks.count.mockResolvedValue(1);

    await request(app)
      .get("/suppliers?search=lanka&page=1&limit=10&sortBy=name&sortOrder=asc")
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.suppliers).toHaveLength(1);
        expect(body.pagination.totalPages).toBe(1);
      });
    expect(supplierMocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          OR: expect.arrayContaining([
            expect.objectContaining({
              name: { contains: "lanka", mode: "insensitive" },
            }),
          ]),
        }),
        orderBy: { name: "asc" },
      }),
    );
  });

  it("validates supplier input and protects mutations by role", async () => {
    await request(app).get("/suppliers").expect(401);

    setAuthenticatedUser("STOREKEEPER");
    await request(app)
      .post("/suppliers")
      .set("Authorization", `Bearer ${token("STOREKEEPER")}`)
      .send({ name: "" })
      .expect(403);

    setAuthenticatedUser("MANAGER");
    await request(app)
      .post("/suppliers")
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .send({ name: "", email: "invalid" })
      .expect(400);
  });

  it("creates and audits a supplier", async () => {
    setAuthenticatedUser("MANAGER");
    const supplier = {
      id: supplierId,
      name: "Lanka Tech",
      contactName: null,
      email: "sales@example.com",
      phone: null,
      address: null,
      taxNumber: null,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    supplierMocks.create.mockResolvedValue(supplier);

    await request(app)
      .post("/suppliers")
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .send({ name: "Lanka Tech", email: "SALES@example.com" })
      .expect(201)
      .expect(({ body }) => {
        expect(body.supplier.email).toBe("sales@example.com");
      });
    expect(auditMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE",
          entity: "Supplier",
          entityId: supplierId,
          ip: expect.any(String),
        }),
      }),
    );
  });

  it("gets, updates, and deactivates suppliers", async () => {
    setAuthenticatedUser("MANAGER");
    const supplier = {
      id: supplierId,
      name: "Lanka Tech",
      contactName: null,
      email: "sales@example.com",
      phone: null,
      address: null,
      taxNumber: null,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    supplierMocks.findUnique.mockResolvedValue(supplier);
    supplierMocks.update.mockResolvedValue({
      ...supplier,
      name: "Lanka Tech Distributors",
    });

    await request(app)
      .get(`/suppliers/${supplierId}`)
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .expect(200);
    await request(app)
      .patch(`/suppliers/${supplierId}`)
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .send({ name: "Lanka Tech Distributors" })
      .expect(200);
    expect(supplierMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Lanka Tech Distributors" }),
      }),
    );

    supplierMocks.update.mockResolvedValue({
      ...supplier,
      isActive: false,
    });
    await request(app)
      .delete(`/suppliers/${supplierId}`)
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.supplier.isActive).toBe(false);
      });
    expect(auditMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "DELETE",
          entity: "Supplier",
          before: expect.any(Object),
          after: expect.any(Object),
        }),
      }),
    );
  });
});

describe("purchase-order services", () => {
  it("lists and gets orders within branch scope", async () => {
    setAuthenticatedUser("STOREKEEPER");
    purchaseOrderMocks.findMany.mockResolvedValue([purchaseOrder()]);
    purchaseOrderMocks.count.mockResolvedValue(1);

    await request(app)
      .get("/purchase-orders?status=DRAFT")
      .set("Authorization", `Bearer ${token("STOREKEEPER")}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.purchaseOrders[0].number).toBe("PO-2026-0001");
      });
    expect(purchaseOrderMocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId, status: "DRAFT" }),
      }),
    );

    purchaseOrderMocks.findUnique.mockResolvedValue(purchaseOrder());
    await request(app)
      .get(`/purchase-orders/${orderId}`)
      .set("Authorization", `Bearer ${token("STOREKEEPER")}`)
      .expect(200);

    purchaseOrderMocks.findUnique.mockResolvedValue({
      ...purchaseOrder(),
      branchId: "d74a189c-ef06-4797-a394-357d764680c3",
    });
    await request(app)
      .get(`/purchase-orders/${orderId}`)
      .set("Authorization", `Bearer ${token("STOREKEEPER")}`)
      .expect(403);
  });

  it("allocates a PO number and creates totals and audit data in one transaction", async () => {
    const order = purchaseOrder();
    supplierMocks.findFirst.mockResolvedValue({ id: supplierId });
    branchMocks.findFirst.mockResolvedValue({ id: branchId });
    productMocks.findMany.mockResolvedValue([{ id: productId }]);
    documentSequenceMocks.upsert.mockResolvedValue({ nextValue: 2 });
    purchaseOrderMocks.create.mockResolvedValue(order);

    const created = await createPurchaseOrder(
      {
        supplierId,
        branchId,
        tax: "1.00",
        items: [{ productId, quantity: 2, unitCost: "10.50" }],
      },
      manager,
      "127.0.0.1",
    );

    expect(created.number).toMatch(/^PO-\d{4}-0001$/);
    expect(documentSequenceMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type_year: {
            type: "PURCHASE_ORDER",
            year: new Date().getFullYear(),
          },
        },
        update: { nextValue: { increment: 1 } },
      }),
    );
    expect(purchaseOrderMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotal: new Prisma.Decimal("21"),
          tax: new Prisma.Decimal("1"),
          total: new Prisma.Decimal("22"),
          items: {
            create: [
              expect.objectContaining({
                quantity: 2,
                unitCost: new Prisma.Decimal("10.5"),
                lineTotal: new Prisma.Decimal("21"),
              }),
            ],
          },
        }),
      }),
    );
    expect(auditMocks.create).toHaveBeenCalled();
    expect(purchasingPrismaMock.$transaction).toHaveBeenCalled();
  });

  it("rejects updates outside DRAFT without writing", async () => {
    purchaseOrderMocks.findUnique.mockResolvedValue(purchaseOrder("APPROVED"));

    await expect(
      updatePurchaseOrder(orderId, { notes: "Changed" }, manager, "127.0.0.1"),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "PURCHASE_ORDER_NOT_DRAFT",
    });
    expect(purchaseOrderMocks.update).not.toHaveBeenCalled();
    expect(auditMocks.create).not.toHaveBeenCalled();
  });

  it("updates draft details and replaces line items atomically", async () => {
    purchaseOrderMocks.findUnique.mockResolvedValue(purchaseOrder());
    purchaseOrderMocks.updateMany.mockResolvedValue({ count: 1 });
    supplierMocks.findFirst.mockResolvedValue({ id: supplierId });
    branchMocks.findFirst.mockResolvedValue({ id: branchId });
    productMocks.findMany.mockResolvedValue([{ id: productId }]);
    purchaseOrderMocks.findUniqueOrThrow.mockResolvedValue(purchaseOrder());

    await updatePurchaseOrder(
      orderId,
      {
        notes: "Updated order",
        tax: "2.00",
        items: [{ productId, quantity: 3, unitCost: "10.00" }],
      },
      manager,
      "127.0.0.1",
    );

    expect(purchaseOrderMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          notes: "Updated order",
          subtotal: new Prisma.Decimal("30"),
          tax: new Prisma.Decimal("2"),
          total: new Prisma.Decimal("32"),
          items: expect.objectContaining({
            deleteMany: {},
            create: [
              expect.objectContaining({
                quantity: 3,
                lineTotal: new Prisma.Decimal("30"),
              }),
            ],
          }),
        }),
      }),
    );
    expect(auditMocks.create).toHaveBeenCalled();
  });

  it("approves only drafts and records the approving user", async () => {
    purchaseOrderMocks.findUnique.mockResolvedValue(purchaseOrder());
    purchaseOrderMocks.updateMany.mockResolvedValue({ count: 1 });
    purchaseOrderMocks.update.mockResolvedValue(purchaseOrder("APPROVED"));

    await approvePurchaseOrder(orderId, manager, "127.0.0.1");

    expect(purchaseOrderMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "APPROVED",
          approvedById: actorId,
        }),
      }),
    );
    expect(auditMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "APPROVE",
          entity: "PurchaseOrder",
          ip: "127.0.0.1",
        }),
      }),
    );
  });

  it("allows managers to cancel approved orders but not storekeepers", async () => {
    purchaseOrderMocks.findUnique.mockResolvedValue(purchaseOrder("APPROVED"));
    purchaseOrderMocks.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      cancelPurchaseOrder(orderId, storekeeper, "127.0.0.1"),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(purchaseOrderMocks.update).not.toHaveBeenCalled();

    purchaseOrderMocks.findUnique.mockResolvedValue(purchaseOrder("APPROVED"));
    purchaseOrderMocks.update.mockResolvedValue(purchaseOrder("CANCELLED"));
    const cancelled = await cancelPurchaseOrder(orderId, manager, "127.0.0.1");
    expect(cancelled.status).toBe("CANCELLED");
    expect(auditMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CANCEL" }),
      }),
    );
  });

  it("restricts purchase-order approval to managers and admins", async () => {
    setAuthenticatedUser("STOREKEEPER");
    await request(app)
      .post(`/purchase-orders/${orderId}/approve`)
      .set("Authorization", `Bearer ${token("STOREKEEPER")}`)
      .expect(403);
    expect(purchaseOrderMocks.findUnique).not.toHaveBeenCalled();
  });
});
