import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
import { withBranchScope } from "../../middleware/branch-scope";
import type { AuthenticatedUser } from "../../middleware/authenticate";
import { prisma } from "../../prisma/client";
import { AppError } from "../../utils/app-error";
import { writeAuditLog } from "../audit/audit.service";
import type {
  AdjustStockInput,
  ListStockQuery,
  TransferStockInput,
} from "./stock.schema";

const stockSelect = {
  id: true,
  productId: true,
  branchId: true,
  quantity: true,
  createdAt: true,
  updatedAt: true,
  product: {
    select: {
      id: true,
      sku: true,
      barcode: true,
      name: true,
      unit: true,
      categoryId: true,
      reorderLevel: true,
      category: { select: { id: true, name: true } },
    },
  },
  branch: { select: { id: true, name: true } },
} as const;

type StockTransaction = Prisma.TransactionClient;

export async function refreshLowStockAlert(
  transaction: StockTransaction,
  branchId: string,
  product: { id: string; name: string; reorderLevel: number },
  quantity: number,
  actorId: string | null,
): Promise<{ lowStock: boolean; resolved: number }> {
  if (quantity <= product.reorderLevel) {
    const message = `${product.name} is low on stock (${quantity} remaining).`;
    await transaction.alert.upsert({
      where: {
        branchId_productId_type: {
          branchId,
          productId: product.id,
          type: "LOW_STOCK",
        },
      },
      create: {
        branchId,
        productId: product.id,
        type: "LOW_STOCK",
        message,
      },
      update: {
        message,
        isRead: false,
        resolvedAt: null,
        resolvedById: null,
      },
    });
    return { lowStock: true, resolved: 0 };
  }

  const result = await transaction.alert.updateMany({
    where: {
      branchId,
      productId: product.id,
      type: "LOW_STOCK",
      resolvedAt: null,
    },
    data: {
      isRead: true,
      resolvedAt: new Date(),
      resolvedById: actorId,
    },
  });
  return { lowStock: false, resolved: result.count };
}

/** Returns a paginated stock listing scoped to the user's authorized branches. */
export async function listStock(
  query: ListStockQuery,
  user: AuthenticatedUser,
): Promise<{
  stock: Awaited<ReturnType<typeof prisma.stock.findMany>>;
  total: number;
}> {
  const scoped = withBranchScope(user, { branchId: query.branchId });
  const where: Prisma.StockWhereInput = {
    ...(scoped.branchId ? { branchId: scoped.branchId } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.search || query.categoryId
      ? {
          product: {
            ...(query.categoryId ? { categoryId: query.categoryId } : {}),
            ...(query.search
              ? {
                  OR: [
                    {
                      name: {
                        contains: query.search,
                        mode: "insensitive",
                      },
                    },
                    {
                      sku: {
                        contains: query.search,
                        mode: "insensitive",
                      },
                    },
                    {
                      barcode: {
                        contains: query.search,
                        mode: "insensitive",
                      },
                    },
                  ],
                }
              : {}),
          },
        }
      : {}),
  };

  if (query.status) {
    const conditions: Prisma.Sql[] = [];
    if (scoped.branchId) {
      conditions.push(Prisma.sql`s."branchId" = ${scoped.branchId}::uuid`);
    }
    if (query.productId) {
      conditions.push(Prisma.sql`s."productId" = ${query.productId}::uuid`);
    }
    if (query.categoryId) {
      conditions.push(Prisma.sql`p."categoryId" = ${query.categoryId}::uuid`);
    }
    if (query.search) {
      const search = `%${query.search}%`;
      conditions.push(
        Prisma.sql`(p."name" ILIKE ${search} OR p."sku" ILIKE ${search} OR p."barcode" ILIKE ${search})`,
      );
    }
    if (query.status === "OUT_OF_STOCK") {
      conditions.push(Prisma.sql`s."quantity" = 0`);
    } else if (query.status === "LOW_STOCK") {
      conditions.push(
        Prisma.sql`s."quantity" > 0 AND s."quantity" <= p."reorderLevel"`,
      );
    } else {
      conditions.push(Prisma.sql`s."quantity" > p."reorderLevel"`);
    }
    const whereSql = Prisma.join(conditions, " AND ");
    const sortColumn = Prisma.raw(
      query.sortBy === "quantity" ? 's."quantity"' : 's."createdAt"',
    );
    const sortDirection = Prisma.raw(query.sortOrder.toUpperCase());
    return prisma.$transaction(async (transaction) => {
      const [idRows, countRows] = await Promise.all([
        transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT s."id"
          FROM "Stock" AS s
          INNER JOIN "Product" AS p ON p."id" = s."productId"
          WHERE ${whereSql}
          ORDER BY ${sortColumn} ${sortDirection}, s."id" ASC
          LIMIT ${query.limit}
          OFFSET ${(query.page - 1) * query.limit}
        `),
        transaction.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
          SELECT COUNT(*)::bigint AS "total"
          FROM "Stock" AS s
          INNER JOIN "Product" AS p ON p."id" = s."productId"
          WHERE ${whereSql}
        `),
      ]);
      const stock = await transaction.stock.findMany({
        where: { id: { in: idRows.map((row) => row.id) } },
        select: stockSelect,
        orderBy: [{ [query.sortBy]: query.sortOrder }, { id: "asc" }],
      });
      return { stock, total: Number(countRows[0]?.total ?? 0n) };
    });
  }

  const [stock, total] = await prisma.$transaction([
    prisma.stock.findMany({
      where,
      select: stockSelect,
      orderBy: [{ [query.sortBy]: query.sortOrder }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.stock.count({ where }),
  ]);
  return { stock, total };
}

/** Applies an atomic stock adjustment, movement, audit, and alert update. */
export async function adjustStock(
  input: AdjustStockInput,
  user: AuthenticatedUser,
  ip: string | undefined,
) {
  const { branchId } = withBranchScope(user, { branchId: input.branchId });
  const referenceId = randomUUID();

  return prisma.$transaction(async (transaction) => {
    const [branch, product] = await Promise.all([
      transaction.branch.findFirst({
        where: { id: branchId, isActive: true },
        select: { id: true },
      }),
      transaction.product.findFirst({
        where: { id: input.productId, isActive: true },
        select: { id: true, name: true, reorderLevel: true },
      }),
    ]);
    if (!branch) {
      throw new AppError(404, "BRANCH_NOT_FOUND", "Active branch not found");
    }
    if (!product) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Active product not found");
    }

    if (input.quantity < 0) {
      const result = await transaction.stock.updateMany({
        where: {
          productId: input.productId,
          branchId,
          quantity: { gte: Math.abs(input.quantity) },
        },
        data: { quantity: { decrement: Math.abs(input.quantity) } },
      });
      if (result.count !== 1) {
        throw new AppError(
          400,
          "INSUFFICIENT_STOCK",
          "Adjustment would make stock quantity negative",
        );
      }
    } else {
      await transaction.stock.upsert({
        where: {
          productId_branchId: {
            productId: input.productId,
            branchId,
          },
        },
        create: {
          productId: input.productId,
          branchId,
          quantity: input.quantity,
        },
        update: { quantity: { increment: input.quantity } },
      });
    }

    const after = await transaction.stock.findUniqueOrThrow({
      where: {
        productId_branchId: {
          productId: input.productId,
          branchId,
        },
      },
      select: stockSelect,
    });
    await transaction.stockMovement.create({
      data: {
        productId: input.productId,
        branchId,
        userId: user.id,
        type: "ADJUSTMENT",
        quantity: input.quantity,
        referenceType: "StockAdjustment",
        referenceId,
        notes: input.notes ?? null,
      },
    });
    await refreshLowStockAlert(
      transaction,
      branchId,
      product,
      after.quantity,
      user.id,
    );
    await writeAuditLog(
      {
        userId: user.id,
        action: "UPDATE",
        entity: "Stock",
        entityId: after.id,
        before: { quantity: after.quantity - input.quantity },
        after: { quantity: after.quantity, referenceId },
        ip,
      },
      transaction,
    );
    return after;
  });
}

/** Transfers stock between branches with paired movement records atomically. */
export async function transferStock(
  input: TransferStockInput,
  user: AuthenticatedUser,
  ip: string | undefined,
) {
  const { branchId: fromBranchId } = withBranchScope(user, {
    branchId: input.fromBranchId,
  });
  const toBranchId = input.toBranchId;
  if (fromBranchId === toBranchId) {
    throw new AppError(
      400,
      "INVALID_TRANSFER",
      "Source and destination branches must differ",
    );
  }
  const transferId = randomUUID();
  const productIds = input.items.map((item) => item.productId);

  return prisma.$transaction(async (transaction) => {
    const branches = await transaction.branch.findMany({
      where: {
        id: { in: [fromBranchId, toBranchId] },
        isActive: true,
      },
      select: { id: true },
    });
    if (branches.length !== 2) {
      throw new AppError(
        404,
        "BRANCH_NOT_FOUND",
        "Both branches must be active",
      );
    }

    const products = await transaction.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: { id: true, name: true, reorderLevel: true },
    });
    if (products.length !== productIds.length) {
      throw new AppError(
        404,
        "PRODUCT_NOT_FOUND",
        "An active product was not found",
      );
    }
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );
    const before: Array<{
      productId: string;
      sourceQuantity: number;
      destinationQuantity: number;
    }> = [];
    const after: Array<{
      productId: string;
      sourceQuantity: number;
      destinationQuantity: number;
    }> = [];

    for (const item of input.items) {
      const product = productById.get(item.productId);
      if (!product) {
        throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
      }
      const source = await transaction.stock.findUnique({
        where: {
          productId_branchId: {
            productId: item.productId,
            branchId: fromBranchId,
          },
        },
        select: { quantity: true },
      });
      if (!source || source.quantity < item.quantity) {
        throw new AppError(
          400,
          "INSUFFICIENT_STOCK",
          `Insufficient stock for product ${product.name}`,
        );
      }
      const result = await transaction.stock.updateMany({
        where: {
          productId: item.productId,
          branchId: fromBranchId,
          quantity: { gte: item.quantity },
        },
        data: { quantity: { decrement: item.quantity } },
      });
      if (result.count !== 1) {
        throw new AppError(
          400,
          "INSUFFICIENT_STOCK",
          `Insufficient stock for product ${product.name}`,
        );
      }
      const destination = await transaction.stock.upsert({
        where: {
          productId_branchId: {
            productId: item.productId,
            branchId: toBranchId,
          },
        },
        create: {
          productId: item.productId,
          branchId: toBranchId,
          quantity: item.quantity,
        },
        update: { quantity: { increment: item.quantity } },
        select: { quantity: true },
      });
      const sourceAfter = await transaction.stock.findUniqueOrThrow({
        where: {
          productId_branchId: {
            productId: item.productId,
            branchId: fromBranchId,
          },
        },
        select: { quantity: true },
      });
      const sourceQuantity = sourceAfter.quantity;
      before.push({
        productId: item.productId,
        sourceQuantity: sourceQuantity + item.quantity,
        destinationQuantity: destination.quantity - item.quantity,
      });
      after.push({
        productId: item.productId,
        sourceQuantity,
        destinationQuantity: destination.quantity,
      });
      await transaction.stockMovement.createMany({
        data: [
          {
            productId: item.productId,
            branchId: fromBranchId,
            userId: user.id,
            type: "TRANSFER_OUT",
            quantity: item.quantity,
            referenceType: "StockTransfer",
            referenceId: transferId,
            notes: input.notes ?? null,
          },
          {
            productId: item.productId,
            branchId: toBranchId,
            userId: user.id,
            type: "TRANSFER_IN",
            quantity: item.quantity,
            referenceType: "StockTransfer",
            referenceId: transferId,
            notes: input.notes ?? null,
          },
        ],
      });
      await refreshLowStockAlert(
        transaction,
        fromBranchId,
        product,
        sourceQuantity,
        user.id,
      );
      await refreshLowStockAlert(
        transaction,
        toBranchId,
        product,
        destination.quantity,
        user.id,
      );
    }

    await writeAuditLog(
      {
        userId: user.id,
        action: "CREATE",
        entity: "StockTransfer",
        entityId: transferId,
        before: { source: before },
        after: {
          fromBranchId,
          toBranchId,
          items: after,
        },
        ip,
      },
      transaction,
    );
    return { transferId, fromBranchId, toBranchId, items: after };
  });
}
