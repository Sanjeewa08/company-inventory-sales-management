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
  receivePurchaseOrder,
} from "../src/modules/purchase-orders/purchase-orders.service";
import {
  alertMocks,
  auditMocks,
  branchMocks,
  documentSequenceMocks,
  goodsReceiptMocks,
  productMocks,
  purchaseOrderMocks,
  purchaseOrderItemMocks,
  purchasingPrismaMock,
  resetPurchasingMocks,
  stockMocks,
  stockMovementMocks,
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
const orderItemId = "c682a9d8-68d9-4eb6-89bf-898c52cf0fc6";
const receiptId = "5a1b19b1-e1db-4b9d-91cd-7bc57605fc51";
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

function token(
  role: "ADMIN" | "MANAGER" | "STOREKEEPER" | "SALES" | "ACCOUNTANT",
) {
  return jwt.sign({ role, branchId }, secret, {
    subject: actorId,
    expiresIn: "1h",
  });
}

function setAuthenticatedUser(
  role: "ADMIN" | "MANAGER" | "STOREKEEPER" | "SALES" | "ACCOUNTANT",
) {
  userMocks.findUnique.mockResolvedValue({
    ...manager,
    role,
  });
}

function purchaseOrder(
  status:
    | "DRAFT"
    | "APPROVED"
    | "PARTIALLY_RECEIVED"
    | "RECEIVED"
    | "CANCELLED" = "DRAFT",
  number = "PO-2026-0001",
  receivedQuantity = 0,
  orderBranchId = branchId,
) {
  return {
    id: orderId,
    number,
    supplierId,
    branchId: orderBranchId,
    createdById: actorId,
    approvedById:
      status === "APPROVED" ||
      status === "PARTIALLY_RECEIVED" ||
      status === "RECEIVED"
        ? actorId
        : null,
    status,
    orderedAt: timestamp,
    expectedAt: null,
    approvedAt:
      status === "APPROVED" ||
      status === "PARTIALLY_RECEIVED" ||
      status === "RECEIVED"
        ? timestamp
        : null,
    notes: null,
    subtotal: new Prisma.Decimal("21.00"),
    tax: new Prisma.Decimal("1.00"),
    total: new Prisma.Decimal("22.00"),
    createdAt: timestamp,
    updatedAt: timestamp,
    supplier: { id: supplierId, name: "Lanka Tech", email: null },
    branch: { id: orderBranchId, name: "Colombo" },
    items: [
      {
        id: orderItemId,
        productId,
        quantity: 2,
        receivedQuantity,
        unitCost: new Prisma.Decimal("10.50"),
        lineTotal: new Prisma.Decimal("21.00"),
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

function goodsReceipt(
  number: string,
  quantity: number,
  receiptBranchId = branchId,
) {
  return {
    id: receiptId,
    number,
    purchaseOrderId: orderId,
    branchId: receiptBranchId,
    receivedById: actorId,
    receivedAt: timestamp,
    notes: null,
    createdAt: timestamp,
    items: [
      {
        id: "0e69039e-f535-4aeb-899d-9e341b413310",
        purchaseOrderItemId: orderItemId,
        quantity,
        unitCost: new Prisma.Decimal("10.50"),
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
    expect(specification).toContain("/purchase-orders/{id}/receive");
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

  it("completes the PO lifecycle through partial and final goods receipts", async () => {
    const draft = purchaseOrder();
    const approved = purchaseOrder("APPROVED");
    const partiallyReceived = purchaseOrder("PARTIALLY_RECEIVED", undefined, 1);
    const received = purchaseOrder("RECEIVED", undefined, 2);

    supplierMocks.findFirst.mockResolvedValue({ id: supplierId });
    branchMocks.findFirst.mockResolvedValue({ id: branchId });
    productMocks.findMany.mockResolvedValue([{ id: productId }]);
    documentSequenceMocks.upsert
      .mockResolvedValueOnce({ nextValue: 2 })
      .mockResolvedValueOnce({ nextValue: 2 })
      .mockResolvedValueOnce({ nextValue: 3 });
    purchaseOrderMocks.create.mockResolvedValue(draft);
    purchaseOrderMocks.findUnique
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(approved)
      .mockResolvedValueOnce(partiallyReceived);
    purchaseOrderMocks.findUniqueOrThrow
      .mockResolvedValueOnce(approved)
      .mockResolvedValueOnce(partiallyReceived);
    purchaseOrderMocks.updateMany.mockResolvedValue({ count: 1 });
    purchaseOrderMocks.update
      .mockResolvedValueOnce(approved)
      .mockResolvedValueOnce(partiallyReceived)
      .mockResolvedValueOnce(received);
    goodsReceiptMocks.create
      .mockResolvedValueOnce(goodsReceipt("GRN-2026-0001", 1))
      .mockResolvedValueOnce(goodsReceipt("GRN-2026-0002", 1));
    purchaseOrderItemMocks.updateMany.mockResolvedValue({ count: 1 });
    stockMocks.upsert
      .mockResolvedValueOnce({ quantity: 1 })
      .mockResolvedValueOnce({ quantity: 2 });

    await createPurchaseOrder(
      {
        supplierId,
        branchId,
        tax: "0.00",
        items: [{ productId, quantity: 2, unitCost: "10.50" }],
      },
      manager,
      "127.0.0.1",
    );
    await approvePurchaseOrder(orderId, manager, "127.0.0.1");

    const firstReceipt = await receivePurchaseOrder(
      orderId,
      { items: [{ purchaseOrderItemId: orderItemId, quantity: 1 }] },
      storekeeper,
      "127.0.0.1",
    );
    expect(firstReceipt.purchaseOrder.status).toBe("PARTIALLY_RECEIVED");
    expect(firstReceipt.goodsReceipt.number).toBe("GRN-2026-0001");

    const finalReceipt = await receivePurchaseOrder(
      orderId,
      { items: [{ purchaseOrderItemId: orderItemId, quantity: 1 }] },
      storekeeper,
      "127.0.0.1",
    );
    expect(finalReceipt.purchaseOrder.status).toBe("RECEIVED");
    expect(finalReceipt.goodsReceipt.number).toBe("GRN-2026-0002");
    expect(documentSequenceMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type_year: {
            type: "GOODS_RECEIPT",
            year: new Date().getFullYear(),
          },
        },
        update: { nextValue: { increment: 1 } },
      }),
    );
    expect(purchaseOrderItemMocks.updateMany).toHaveBeenCalledTimes(2);
    expect(stockMocks.upsert).toHaveBeenCalledTimes(2);
    expect(stockMovementMocks.create).toHaveBeenCalledTimes(2);
    expect(alertMocks.upsert).toHaveBeenCalledTimes(2);
    expect(auditMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE",
          entity: "GoodsReceipt",
          after: expect.objectContaining({ number: "GRN-2026-0001" }),
          ip: "127.0.0.1",
        }),
      }),
    );
  });

  it("rejects over-receiving without creating stock or receipt records", async () => {
    purchaseOrderMocks.findUnique.mockResolvedValue(purchaseOrder("APPROVED"));
    purchaseOrderMocks.updateMany.mockResolvedValue({ count: 1 });
    purchaseOrderMocks.findUniqueOrThrow.mockResolvedValue(
      purchaseOrder("APPROVED"),
    );
    branchMocks.findFirst.mockResolvedValue({ id: branchId });

    await expect(
      receivePurchaseOrder(
        orderId,
        { items: [{ purchaseOrderItemId: orderItemId, quantity: 3 }] },
        manager,
        "127.0.0.1",
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "OVER_RECEIVING" });
    expect(goodsReceiptMocks.create).not.toHaveBeenCalled();
    expect(stockMocks.upsert).not.toHaveBeenCalled();
    expect(stockMovementMocks.create).not.toHaveBeenCalled();
  });

  it("rejects receiving a purchase order that is not approved", async () => {
    purchaseOrderMocks.findUnique.mockResolvedValue(purchaseOrder("DRAFT"));

    await expect(
      receivePurchaseOrder(
        orderId,
        { items: [{ purchaseOrderItemId: orderItemId, quantity: 1 }] },
        manager,
        "127.0.0.1",
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "PURCHASE_ORDER_NOT_RECEIVABLE",
    });
    expect(purchaseOrderMocks.updateMany).not.toHaveBeenCalled();
    expect(goodsReceiptMocks.create).not.toHaveBeenCalled();
  });

  it("rejects invalid receipt input and callers with the wrong role", async () => {
    setAuthenticatedUser("SALES");
    await request(app)
      .post(`/purchase-orders/${orderId}/receive`)
      .set("Authorization", `Bearer ${token("SALES")}`)
      .send({ items: [{ purchaseOrderItemId: orderItemId, quantity: 1 }] })
      .expect(403);
    expect(purchaseOrderMocks.findUnique).not.toHaveBeenCalled();

    setAuthenticatedUser("MANAGER");
    await request(app)
      .post(`/purchase-orders/${orderId}/receive`)
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .send({ items: [{ purchaseOrderItemId: orderItemId, quantity: 0 }] })
      .expect(400);
    expect(purchaseOrderMocks.findUnique).not.toHaveBeenCalled();
  });

  it("scopes storekeepers to their branch while managers may receive cross-branch", async () => {
    const otherBranchId = "d74a189c-ef06-4797-a394-357d764680c3";
    setAuthenticatedUser("STOREKEEPER");
    purchaseOrderMocks.findUnique.mockResolvedValue(
      purchaseOrder("APPROVED", "PO-2026-0001", 0, otherBranchId),
    );
    await request(app)
      .post(`/purchase-orders/${orderId}/receive`)
      .set("Authorization", `Bearer ${token("STOREKEEPER")}`)
      .send({ items: [{ purchaseOrderItemId: orderItemId, quantity: 1 }] })
      .expect(403);
    expect(goodsReceiptMocks.create).not.toHaveBeenCalled();

    setAuthenticatedUser("MANAGER");
    const crossBranchOrder = purchaseOrder(
      "APPROVED",
      "PO-2026-0001",
      0,
      otherBranchId,
    );
    purchaseOrderMocks.findUnique.mockResolvedValue(crossBranchOrder);
    purchaseOrderMocks.updateMany.mockResolvedValue({ count: 1 });
    purchaseOrderMocks.findUniqueOrThrow.mockResolvedValue(crossBranchOrder);
    purchaseOrderMocks.update.mockResolvedValue(
      purchaseOrder("PARTIALLY_RECEIVED", "PO-2026-0001", 1, otherBranchId),
    );
    branchMocks.findFirst.mockResolvedValue({ id: otherBranchId });
    documentSequenceMocks.upsert.mockResolvedValue({ nextValue: 2 });
    goodsReceiptMocks.create.mockResolvedValue(
      goodsReceipt("GRN-2026-0001", 1, otherBranchId),
    );
    purchaseOrderItemMocks.updateMany.mockResolvedValue({ count: 1 });
    stockMocks.upsert.mockResolvedValue({ quantity: 1 });
    alertMocks.upsert.mockResolvedValue(null);

    await request(app)
      .post(`/purchase-orders/${orderId}/receive`)
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .send({ items: [{ purchaseOrderItemId: orderItemId, quantity: 1 }] })
      .expect(201);
    expect(stockMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productId_branchId: {
            productId,
            branchId: otherBranchId,
          },
        },
      }),
    );
  });
});
