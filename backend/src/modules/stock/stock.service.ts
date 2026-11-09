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
      name: true,
      unit: true,
      reorderLevel: true,
    },
  },
} as const;

type StockTransaction = Prisma.TransactionClient;

async function updateLowStockAlert(
  transaction: StockTransaction,
  branchId: string,
  product: { id: string; name: string; reorderLevel: number },
  quantity: number,
  actorId: string,
): Promise<void> {
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
    return;
  }

  await transaction.alert.updateMany({
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
  };
  const [stock, total] = await prisma.$transaction([
    prisma.stock.findMany({
      where,
      select: stockSelect,
      orderBy: { [query.sortBy]: query.sortOrder },
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
    await updateLowStockAlert(
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
      await updateLowStockAlert(
        transaction,
        fromBranchId,
        product,
        sourceQuantity,
        user.id,
      );
      await updateLowStockAlert(
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
