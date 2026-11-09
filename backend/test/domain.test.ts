import jwt from "jsonwebtoken";
import request from "supertest";
import { Prisma } from "../src/generated/prisma/client";
import { AppError } from "../src/utils/app-error";
import { openApiSpec } from "../src/swagger";
import { adjustStock, transferStock } from "../src/modules/stock/stock.service";
import {
  alertMocks,
  auditMocks,
  branchMocks,
  categoryMocks,
  prismaDomainMock,
  productMocks,
  resetDomainMocks,
  stockMocks,
  stockMovementMocks,
  userMocks,
} from "./support/domain-prisma-mock";

jest.mock("../src/prisma/client", () => ({
  prisma: jest.requireActual("./support/domain-prisma-mock").prismaDomainMock,
}));

import { app } from "../src/app";

const secret = process.env.JWT_SECRET!;
const actorId = "d4f79285-4be7-4c54-95a7-143268b8474c";
const branchId = "e501fe6c-78bb-432a-b3b2-cfab4d08e8f3";
const otherBranchId = "d74a189c-ef06-4797-a394-357d764680c3";
const productId = "c50b8962-58db-4efb-883f-4bb04af77873";

function token(role: "ADMIN" | "MANAGER" | "STOREKEEPER" | "SALES") {
  return jwt.sign({ role, branchId }, secret, {
    subject: actorId,
    expiresIn: "1h",
  });
}

function setAuthenticatedUser(
  role: "ADMIN" | "MANAGER" | "STOREKEEPER" | "SALES",
) {
  userMocks.findUnique.mockResolvedValue({
    id: actorId,
    name: "Test User",
    email: "test@example.com",
    role,
    branchId,
    isActive: true,
  });
}

const storekeeper = {
  id: actorId,
  name: "Test User",
  email: "test@example.com",
  role: "STOREKEEPER" as const,
  branchId,
  isActive: true,
};

beforeEach(() => {
  resetDomainMocks();
});

describe("branch, catalog, and stock APIs", () => {
  it("limits a branch list to the caller's own branch", async () => {
    setAuthenticatedUser("STOREKEEPER");
    branchMocks.findMany.mockResolvedValue([
      {
        id: branchId,
        name: "Colombo",
        address: null,
        phone: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    branchMocks.count.mockResolvedValue(1);

    await request(app)
      .get("/branches")
      .set("Authorization", `Bearer ${token("STOREKEEPER")}`)
      .expect(200);
    expect(branchMocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: branchId }),
      }),
    );
  });

  it("requires authentication for branch endpoints", async () => {
    await request(app).get("/branches").expect(401);
  });

  it("includes the Phase 4 APIs in Swagger", () => {
    const specification = JSON.stringify(openApiSpec);
    for (const path of [
      "/branches",
      "/categories",
      "/products",
      "/stock",
      "/stock/adjustments",
      "/stock/transfers",
    ]) {
      expect(specification).toContain(path);
    }
  });

  it("creates and audits a branch", async () => {
    setAuthenticatedUser("ADMIN");
    const branch = {
      id: branchId,
      name: "Colombo",
      address: null,
      phone: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    branchMocks.create.mockResolvedValue(branch);

    await request(app)
      .post("/branches")
      .set("Authorization", `Bearer ${token("ADMIN")}`)
      .send({ name: "Colombo" })
      .expect(201)
      .expect(({ body }) => {
        expect(body.branch.id).toBe(branchId);
      });
    expect(auditMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE",
          entity: "Branch",
          entityId: branchId,
        }),
      }),
    );
  });

  it("creates categories and products with managers' write access", async () => {
    setAuthenticatedUser("MANAGER");
    const category = {
      id: "72a1199f-6f5c-4140-a050-49a23e74e4a0",
      name: "Electronics",
      description: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    categoryMocks.create.mockResolvedValue(category);

    await request(app)
      .post("/categories")
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .send({ name: "Electronics" })
      .expect(201);
    expect(auditMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "Category" }),
      }),
    );

    const product = {
      id: productId,
      sku: "ELE-001",
      barcode: "0123456789012",
      name: "USB-C Charger",
      description: null,
      unit: "unit",
      categoryId: category.id,
      costPrice: new Prisma.Decimal("1250.00"),
      sellingPrice: new Prisma.Decimal("1750.00"),
      reorderLevel: 3,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    categoryMocks.findFirst.mockResolvedValue({ id: category.id });
    productMocks.create.mockResolvedValue(product);

    await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token("MANAGER")}`)
      .send({
        sku: product.sku,
        barcode: product.barcode,
        name: product.name,
        categoryId: category.id,
        costPrice: "1250.00",
        sellingPrice: "1750.00",
        reorderLevel: 3,
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.product).not.toHaveProperty("passwordHash");
        expect(body.product.sellingPrice).toBe("1750");
      });
    expect(auditMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "Product" }),
      }),
    );
  });

  it("filters products by barcode", async () => {
    setAuthenticatedUser("SALES");
    productMocks.findMany.mockResolvedValue([]);
    productMocks.count.mockResolvedValue(0);

    await request(app)
      .get("/products?barcode=0123456789012")
      .set("Authorization", `Bearer ${token("SALES")}`)
      .expect(200);

    expect(productMocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          barcode: {
            contains: "0123456789012",
            mode: "insensitive",
          },
        }),
      }),
    );
  });

  it("rejects a branch-scoped stock query for another branch", async () => {
    setAuthenticatedUser("STOREKEEPER");

    await request(app)
      .get(`/stock?branchId=${otherBranchId}`)
      .set("Authorization", `Bearer ${token("STOREKEEPER")}`)
      .expect(403);
    expect(stockMocks.findMany).not.toHaveBeenCalled();
  });

  it("validates stock adjustments and enforces manager-only catalog writes", async () => {
    setAuthenticatedUser("SALES");

    await request(app)
      .post("/stock/adjustments")
      .set("Authorization", `Bearer ${token("SALES")}`)
      .send({ branchId, productId, quantity: 0 })
      .expect(403);

    setAuthenticatedUser("STOREKEEPER");
    await request(app)
      .post("/stock/adjustments")
      .set("Authorization", `Bearer ${token("STOREKEEPER")}`)
      .send({ branchId, productId, quantity: 0 })
      .expect(400);

    setAuthenticatedUser("SALES");
    await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token("SALES")}`)
      .send({})
      .expect(403);
  });
});

describe("stock services", () => {
  it("records an adjustment, audit row, and low-stock alert atomically", async () => {
    branchMocks.findFirst.mockResolvedValue({ id: branchId });
    productMocks.findFirst.mockResolvedValue({
      id: productId,
      name: "USB-C Charger",
      reorderLevel: 3,
    });
    stockMocks.upsert.mockResolvedValue({ id: "stock-id" });
    stockMocks.findUniqueOrThrow.mockResolvedValue({
      id: "stock-id",
      productId,
      branchId,
      quantity: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      product: {
        id: productId,
        sku: "ELE-001",
        name: "USB-C Charger",
        unit: "unit",
        reorderLevel: 3,
      },
    });

    const updated = await adjustStock(
      { branchId, productId, quantity: 2 },
      storekeeper,
      "127.0.0.1",
    );

    expect(updated.quantity).toBe(2);
    expect(stockMovementMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ADJUSTMENT",
          quantity: 2,
          referenceType: "StockAdjustment",
        }),
      }),
    );
    expect(alertMocks.upsert).toHaveBeenCalled();
    expect(auditMocks.create).toHaveBeenCalled();
  });

  it("rejects a stock decrease that would make quantity negative", async () => {
    branchMocks.findFirst.mockResolvedValue({ id: branchId });
    productMocks.findFirst.mockResolvedValue({
      id: productId,
      name: "USB-C Charger",
      reorderLevel: 3,
    });
    stockMocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      adjustStock(
        { branchId, productId, quantity: -4 },
        storekeeper,
        "127.0.0.1",
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "INSUFFICIENT_STOCK",
    });
    expect(stockMovementMocks.create).not.toHaveBeenCalled();
    expect(auditMocks.create).not.toHaveBeenCalled();
  });

  it("transfers stock with paired movements and refreshes destination alerts", async () => {
    const items = [{ productId, quantity: 3 }];
    branchMocks.findMany.mockResolvedValue([
      { id: branchId },
      { id: otherBranchId },
    ]);
    productMocks.findMany.mockResolvedValue([
      { id: productId, name: "USB-C Charger", reorderLevel: 4 },
    ]);
    stockMocks.findUnique.mockResolvedValue({ quantity: 10 });
    stockMocks.updateMany.mockResolvedValue({ count: 1 });
    stockMocks.upsert.mockResolvedValue({ quantity: 3 });
    stockMocks.findUniqueOrThrow.mockResolvedValue({ quantity: 7 });

    const result = await transferStock(
      {
        fromBranchId: branchId,
        toBranchId: otherBranchId,
        items,
      },
      storekeeper,
      "127.0.0.1",
    );

    expect(result.items[0]).toMatchObject({
      productId,
      sourceQuantity: 7,
      destinationQuantity: 3,
    });
    expect(stockMovementMocks.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            type: "TRANSFER_OUT",
            referenceId: result.transferId,
          }),
          expect.objectContaining({
            type: "TRANSFER_IN",
            referenceId: result.transferId,
          }),
        ]),
      }),
    );
    expect(alertMocks.upsert).toHaveBeenCalled();
    expect(alertMocks.updateMany).toHaveBeenCalled();
    expect(auditMocks.create).toHaveBeenCalled();
    expect(prismaDomainMock.$transaction).toHaveBeenCalled();
  });

  it("rejects an invalid transfer before touching the database", async () => {
    await expect(
      transferStock(
        {
          fromBranchId: otherBranchId,
          toBranchId: branchId,
          items: [{ productId, quantity: 1 }],
        },
        storekeeper,
        "127.0.0.1",
      ),
    ).rejects.toBeInstanceOf(AppError);
    expect(branchMocks.findMany).not.toHaveBeenCalled();
  });
});
