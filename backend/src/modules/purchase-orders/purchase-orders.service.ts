import {
  Prisma,
  type PurchaseOrderStatus,
} from "../../generated/prisma/client";
import type { AuthenticatedUser } from "../../middleware/authenticate";
import { withBranchScope } from "../../middleware/branch-scope";
import { prisma } from "../../prisma/client";
import { AppError } from "../../utils/app-error";
import { writeAuditLog } from "../audit/audit.service";
import { refreshLowStockAlert } from "../stock/stock.service";
import type {
  CreatePurchaseOrderInput,
  ListPurchaseOrdersQuery,
  ReceivePurchaseOrderInput,
  UpdatePurchaseOrderInput,
} from "./purchase-orders.schema";

const purchaseOrderSelect = {
  id: true,
  number: true,
  supplierId: true,
  branchId: true,
  createdById: true,
  approvedById: true,
  status: true,
  orderedAt: true,
  expectedAt: true,
  approvedAt: true,
  notes: true,
  subtotal: true,
  tax: true,
  total: true,
  createdAt: true,
  updatedAt: true,
  supplier: {
    select: { id: true, name: true, email: true },
  },
  branch: {
    select: { id: true, name: true },
  },
  items: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      productId: true,
      quantity: true,
      receivedQuantity: true,
      unitCost: true,
      lineTotal: true,
      product: {
        select: { id: true, sku: true, name: true, unit: true },
      },
    },
  },
} satisfies Prisma.PurchaseOrderSelect;

const purchaseOrderReceiveSelect = {
  ...purchaseOrderSelect,
  items: {
    ...purchaseOrderSelect.items,
    select: {
      ...purchaseOrderSelect.items.select,
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          unit: true,
          reorderLevel: true,
        },
      },
    },
  },
} satisfies Prisma.PurchaseOrderSelect;

const goodsReceiptSelect = {
  id: true,
  number: true,
  purchaseOrderId: true,
  branchId: true,
  receivedById: true,
  receivedAt: true,
  notes: true,
  createdAt: true,
  items: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      purchaseOrderItemId: true,
      quantity: true,
      unitCost: true,
    },
  },
} satisfies Prisma.GoodsReceiptSelect;

type PurchaseOrderRecord = Prisma.PurchaseOrderGetPayload<{
  select: typeof purchaseOrderSelect;
}>;

type GoodsReceiptRecord = Prisma.GoodsReceiptGetPayload<{
  select: typeof goodsReceiptSelect;
}>;

function auditPurchaseOrder(
  order: PurchaseOrderRecord,
): Prisma.InputJsonObject {
  return {
    id: order.id,
    number: order.number,
    supplierId: order.supplierId,
    branchId: order.branchId,
    createdById: order.createdById,
    approvedById: order.approvedById,
    status: order.status,
    orderedAt: order.orderedAt.toISOString(),
    expectedAt: order.expectedAt?.toISOString() ?? null,
    approvedAt: order.approvedAt?.toISOString() ?? null,
    notes: order.notes,
    subtotal: order.subtotal.toString(),
    tax: order.tax.toString(),
    total: order.total.toString(),
    items: order.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      receivedQuantity: item.receivedQuantity,
      unitCost: item.unitCost.toString(),
      lineTotal: item.lineTotal.toString(),
    })),
  };
}

function auditGoodsReceipt(
  receipt: GoodsReceiptRecord,
): Prisma.InputJsonObject {
  return {
    id: receipt.id,
    number: receipt.number,
    purchaseOrderId: receipt.purchaseOrderId,
    branchId: receipt.branchId,
    receivedById: receipt.receivedById,
    receivedAt: receipt.receivedAt.toISOString(),
    notes: receipt.notes,
    items: receipt.items.map((item) => ({
      purchaseOrderItemId: item.purchaseOrderItemId,
      quantity: item.quantity,
      unitCost: item.unitCost.toString(),
    })),
  };
}

function calculateSubtotal(
  items: Array<{ quantity: number; unitCost: Prisma.Decimal }>,
): Prisma.Decimal {
  const subtotal = items.reduce(
    (subtotal, item) => subtotal.plus(item.unitCost.mul(item.quantity)),
    new Prisma.Decimal(0),
  );
  assertMoneyPrecision(subtotal);
  return subtotal;
}

function assertMoneyPrecision(amount: Prisma.Decimal): void {
  if (amount.comparedTo(new Prisma.Decimal("9999999999.99")) > 0) {
    throw new AppError(
      400,
      "PURCHASE_ORDER_TOTAL_TOO_LARGE",
      "Purchase order amounts exceed the supported precision",
    );
  }
}

async function validateSupplier(
  transaction: Prisma.TransactionClient,
  supplierId: string,
): Promise<void> {
  const supplier = await transaction.supplier.findFirst({
    where: { id: supplierId, isActive: true },
    select: { id: true },
  });
  if (!supplier) {
    throw new AppError(404, "SUPPLIER_NOT_FOUND", "Active supplier not found");
  }
}

async function validateBranch(
  transaction: Prisma.TransactionClient,
  branchId: string,
): Promise<void> {
  const branch = await transaction.branch.findFirst({
    where: { id: branchId, isActive: true },
    select: { id: true },
  });
  if (!branch) {
    throw new AppError(404, "BRANCH_NOT_FOUND", "Active branch not found");
  }
}

async function validateSupplierAndBranch(
  transaction: Prisma.TransactionClient,
  supplierId: string,
  branchId: string,
): Promise<void> {
  await Promise.all([
    validateSupplier(transaction, supplierId),
    validateBranch(transaction, branchId),
  ]);
}

async function validateProducts(
  transaction: Prisma.TransactionClient,
  items: Array<{ productId: string; quantity: number; unitCost: string }>,
): Promise<
  Array<{ productId: string; quantity: number; unitCost: Prisma.Decimal }>
> {
  const products = await transaction.product.findMany({
    where: {
      id: { in: items.map((item) => item.productId) },
      isActive: true,
    },
    select: { id: true },
  });
  if (products.length !== items.length) {
    throw new AppError(
      404,
      "PRODUCT_NOT_FOUND",
      "An active product was not found",
    );
  }
  return items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    unitCost: new Prisma.Decimal(item.unitCost),
  }));
}

async function nextPurchaseOrderNumber(
  transaction: Prisma.TransactionClient,
): Promise<string> {
  const year = new Date().getFullYear();
  const sequence = await transaction.documentSequence.upsert({
    where: {
      type_year: {
        type: "PURCHASE_ORDER",
        year,
      },
    },
    create: {
      type: "PURCHASE_ORDER",
      year,
      nextValue: 2,
    },
    update: {
      nextValue: { increment: 1 },
    },
    select: { nextValue: true },
  });
  return `PO-${year}-${String(sequence.nextValue - 1).padStart(4, "0")}`;
}

async function nextGoodsReceiptNumber(
  transaction: Prisma.TransactionClient,
): Promise<string> {
  const year = new Date().getFullYear();
  const sequence = await transaction.documentSequence.upsert({
    where: {
      type_year: {
        type: "GOODS_RECEIPT",
        year,
      },
    },
    create: {
      type: "GOODS_RECEIPT",
      year,
      nextValue: 2,
    },
    update: {
      nextValue: { increment: 1 },
    },
    select: { nextValue: true },
  });
  return `GRN-${year}-${String(sequence.nextValue - 1).padStart(4, "0")}`;
}

function scopeOrderBranch(user: AuthenticatedUser, branchId: string): void {
  withBranchScope(user, { branchId });
}

/** Returns a filtered and paginated purchase-order listing for allowed branches. */
export async function listPurchaseOrders(
  query: ListPurchaseOrdersQuery,
  user: AuthenticatedUser,
): Promise<{ purchaseOrders: PurchaseOrderRecord[]; total: number }> {
  const scoped = withBranchScope(user, { branchId: query.branchId });
  const where: Prisma.PurchaseOrderWhereInput = {
    ...(scoped.branchId ? { branchId: scoped.branchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(query.search
      ? {
          OR: [
            { number: { contains: query.search, mode: "insensitive" } },
            {
              supplier: {
                is: { name: { contains: query.search, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };
  const [purchaseOrders, total] = await prisma.$transaction([
    prisma.purchaseOrder.findMany({
      where,
      select: purchaseOrderSelect,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  return { purchaseOrders, total };
}

/** Gets an order after applying the caller's branch scope. */
export async function getPurchaseOrder(
  id: string,
  user: AuthenticatedUser,
): Promise<PurchaseOrderRecord> {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: purchaseOrderSelect,
  });
  if (!order) {
    throw new AppError(
      404,
      "PURCHASE_ORDER_NOT_FOUND",
      "Purchase order not found",
    );
  }
  scopeOrderBranch(user, order.branchId);
  return order;
}

/** Creates a draft purchase order with a transaction-safe PO number. */
export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
  user: AuthenticatedUser,
  ip: string | undefined,
): Promise<PurchaseOrderRecord> {
  const { branchId } = withBranchScope(user, { branchId: input.branchId });
  return prisma.$transaction(async (transaction) => {
    await validateSupplierAndBranch(transaction, input.supplierId, branchId);
    const items = await validateProducts(transaction, input.items);
    const subtotal = calculateSubtotal(items);
    const tax = new Prisma.Decimal(input.tax);
    const total = subtotal.plus(tax);
    assertMoneyPrecision(total);
    const order = await transaction.purchaseOrder.create({
      data: {
        number: await nextPurchaseOrderNumber(transaction),
        supplierId: input.supplierId,
        branchId,
        createdById: user.id,
        status: "DRAFT",
        expectedAt: input.expectedAt ?? null,
        notes: input.notes ?? null,
        subtotal,
        tax,
        total,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
            lineTotal: item.unitCost.mul(item.quantity),
          })),
        },
      },
      select: purchaseOrderSelect,
    });
    await writeAuditLog(
      {
        userId: user.id,
        action: "CREATE",
        entity: "PurchaseOrder",
        entityId: order.id,
        after: auditPurchaseOrder(order),
        ip,
      },
      transaction,
    );
    return order;
  });
}

/** Updates a draft order and replaces its items only when supplied. */
export async function updatePurchaseOrder(
  id: string,
  input: UpdatePurchaseOrderInput,
  user: AuthenticatedUser,
  ip: string | undefined,
): Promise<PurchaseOrderRecord> {
  return prisma.$transaction(async (transaction) => {
    const before = await transaction.purchaseOrder.findUnique({
      where: { id },
      select: purchaseOrderSelect,
    });
    if (!before) {
      throw new AppError(
        404,
        "PURCHASE_ORDER_NOT_FOUND",
        "Purchase order not found",
      );
    }
    scopeOrderBranch(user, before.branchId);
    if (before.status !== "DRAFT") {
      throw new AppError(
        409,
        "PURCHASE_ORDER_NOT_DRAFT",
        "Only draft purchase orders can be updated",
      );
    }
    const draftLock = await transaction.purchaseOrder.updateMany({
      where: { id, status: "DRAFT" },
      data: { updatedAt: new Date() },
    });
    if (draftLock.count !== 1) {
      throw new AppError(
        409,
        "PURCHASE_ORDER_NOT_DRAFT",
        "Only draft purchase orders can be updated",
      );
    }
    const supplierId = input.supplierId ?? before.supplierId;
    const branchId = input.branchId ?? before.branchId;
    scopeOrderBranch(user, branchId);
    if (input.supplierId !== undefined) {
      await validateSupplier(transaction, supplierId);
    }
    if (input.branchId !== undefined) {
      await validateBranch(transaction, branchId);
    }
    const items =
      input.items === undefined
        ? undefined
        : await validateProducts(transaction, input.items);
    const subtotal = items ? calculateSubtotal(items) : before.subtotal;
    const tax =
      input.tax === undefined ? before.tax : new Prisma.Decimal(input.tax);
    const total = subtotal.plus(tax);
    assertMoneyPrecision(subtotal);
    assertMoneyPrecision(tax);
    assertMoneyPrecision(total);

    await transaction.purchaseOrder.update({
      where: { id },
      data: {
        ...(input.supplierId === undefined ? {} : { supplierId }),
        ...(input.branchId === undefined ? {} : { branchId }),
        ...(input.expectedAt === undefined
          ? {}
          : { expectedAt: input.expectedAt }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        subtotal,
        tax,
        total,
        ...(items
          ? {
              items: {
                deleteMany: {},
                create: items.map((item) => ({
                  productId: item.productId,
                  quantity: item.quantity,
                  unitCost: item.unitCost,
                  lineTotal: item.unitCost.mul(item.quantity),
                })),
              },
            }
          : {}),
      },
    });
    const after = await transaction.purchaseOrder.findUniqueOrThrow({
      where: { id },
      select: purchaseOrderSelect,
    });
    await writeAuditLog(
      {
        userId: user.id,
        action: "UPDATE",
        entity: "PurchaseOrder",
        entityId: id,
        before: auditPurchaseOrder(before),
        after: auditPurchaseOrder(after),
        ip,
      },
      transaction,
    );
    return after;
  });
}

/** Approves a draft purchase order and records the approving manager. */
export async function approvePurchaseOrder(
  id: string,
  user: AuthenticatedUser,
  ip: string | undefined,
): Promise<PurchaseOrderRecord> {
  return prisma.$transaction(async (transaction) => {
    const before = await transaction.purchaseOrder.findUnique({
      where: { id },
      select: purchaseOrderSelect,
    });
    if (!before) {
      throw new AppError(
        404,
        "PURCHASE_ORDER_NOT_FOUND",
        "Purchase order not found",
      );
    }
    if (before.status !== "DRAFT") {
      throw new AppError(
        409,
        "PURCHASE_ORDER_NOT_DRAFT",
        "Only draft purchase orders can be approved",
      );
    }
    const draftLock = await transaction.purchaseOrder.updateMany({
      where: { id, status: "DRAFT" },
      data: { updatedAt: new Date() },
    });
    if (draftLock.count !== 1) {
      throw new AppError(
        409,
        "PURCHASE_ORDER_NOT_DRAFT",
        "Only draft purchase orders can be approved",
      );
    }
    const after = await transaction.purchaseOrder.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedById: user.id,
        approvedAt: new Date(),
      },
      select: purchaseOrderSelect,
    });
    await writeAuditLog(
      {
        userId: user.id,
        action: "APPROVE",
        entity: "PurchaseOrder",
        entityId: id,
        before: auditPurchaseOrder(before),
        after: auditPurchaseOrder(after),
        ip,
      },
      transaction,
    );
    return after;
  });
}

/** Receives approved order quantities and updates stock atomically. */
export async function receivePurchaseOrder(
  id: string,
  input: ReceivePurchaseOrderInput,
  user: AuthenticatedUser,
  ip: string | undefined,
): Promise<{
  goodsReceipt: GoodsReceiptRecord;
  purchaseOrder: PurchaseOrderRecord;
}> {
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, branchId: true, status: true },
    });
    if (!current) {
      throw new AppError(
        404,
        "PURCHASE_ORDER_NOT_FOUND",
        "Purchase order not found",
      );
    }
    scopeOrderBranch(user, current.branchId);
    if (
      current.status !== "APPROVED" &&
      current.status !== "PARTIALLY_RECEIVED"
    ) {
      throw new AppError(
        409,
        "PURCHASE_ORDER_NOT_RECEIVABLE",
        "Only approved or partially received purchase orders can be received",
      );
    }

    const receiptLock = await transaction.purchaseOrder.updateMany({
      where: {
        id,
        status: { in: ["APPROVED", "PARTIALLY_RECEIVED"] },
      },
      data: { updatedAt: new Date() },
    });
    if (receiptLock.count !== 1) {
      throw new AppError(
        409,
        "PURCHASE_ORDER_NOT_RECEIVABLE",
        "Purchase order status changed and it can no longer be received",
      );
    }

    const order = await transaction.purchaseOrder.findUniqueOrThrow({
      where: { id },
      select: purchaseOrderReceiveSelect,
    });
    scopeOrderBranch(user, order.branchId);
    if (order.status !== "APPROVED" && order.status !== "PARTIALLY_RECEIVED") {
      throw new AppError(
        409,
        "PURCHASE_ORDER_NOT_RECEIVABLE",
        "Only approved or partially received purchase orders can be received",
      );
    }
    await validateBranch(transaction, order.branchId);

    const orderItems = new Map(order.items.map((item) => [item.id, item]));
    const receiptItems = input.items.map((item) => {
      const orderItem = orderItems.get(item.purchaseOrderItemId);
      if (!orderItem) {
        throw new AppError(
          400,
          "INVALID_PURCHASE_ORDER_ITEM",
          "A receipt item does not belong to this purchase order",
        );
      }
      if (item.quantity > orderItem.quantity - orderItem.receivedQuantity) {
        throw new AppError(
          400,
          "OVER_RECEIVING",
          "Received quantity cannot exceed the remaining ordered quantity",
        );
      }
      return { orderItem, quantity: item.quantity };
    });

    const receipt = await transaction.goodsReceipt.create({
      data: {
        number: await nextGoodsReceiptNumber(transaction),
        purchaseOrderId: id,
        branchId: order.branchId,
        receivedById: user.id,
        notes: input.notes ?? null,
        items: {
          create: receiptItems.map(({ orderItem, quantity }) => ({
            purchaseOrderItemId: orderItem.id,
            quantity,
            unitCost: orderItem.unitCost,
          })),
        },
      },
      select: goodsReceiptSelect,
    });

    for (const { orderItem, quantity } of receiptItems) {
      const itemUpdate = await transaction.purchaseOrderItem.updateMany({
        where: {
          id: orderItem.id,
          purchaseOrderId: id,
          receivedQuantity: { lte: orderItem.quantity - quantity },
        },
        data: { receivedQuantity: { increment: quantity } },
      });
      if (itemUpdate.count !== 1) {
        throw new AppError(
          400,
          "OVER_RECEIVING",
          "Received quantity cannot exceed the remaining ordered quantity",
        );
      }

      const stock = await transaction.stock.upsert({
        where: {
          productId_branchId: {
            productId: orderItem.productId,
            branchId: order.branchId,
          },
        },
        create: {
          branchId: order.branchId,
          productId: orderItem.productId,
          quantity,
        },
        update: { quantity: { increment: quantity } },
        select: { quantity: true },
      });
      await transaction.stockMovement.create({
        data: {
          productId: orderItem.productId,
          branchId: order.branchId,
          userId: user.id,
          type: "PURCHASE",
          quantity,
          referenceType: "GoodsReceipt",
          referenceId: receipt.id,
          notes: input.notes ?? `Goods receipt ${receipt.number}`,
        },
      });
      await refreshLowStockAlert(
        transaction,
        order.branchId,
        orderItem.product,
        stock.quantity,
        user.id,
      );
    }

    const receivedByItemId = new Map(
      receiptItems.map(({ orderItem, quantity }) => [orderItem.id, quantity]),
    );
    const fullyReceived = order.items.every(
      (item) =>
        item.receivedQuantity + (receivedByItemId.get(item.id) ?? 0) >=
        item.quantity,
    );
    const updatedOrder = await transaction.purchaseOrder.update({
      where: { id },
      data: { status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" },
      select: purchaseOrderSelect,
    });

    await writeAuditLog(
      {
        userId: user.id,
        action: "CREATE",
        entity: "GoodsReceipt",
        entityId: receipt.id,
        after: auditGoodsReceipt(receipt),
        ip,
      },
      transaction,
    );
    await writeAuditLog(
      {
        userId: user.id,
        action: "UPDATE",
        entity: "PurchaseOrder",
        entityId: id,
        before: auditPurchaseOrder(order),
        after: auditPurchaseOrder(updatedOrder),
        ip,
      },
      transaction,
    );

    return { goodsReceipt: receipt, purchaseOrder: updatedOrder };
  });
}

/** Cancels a draft order, or an approved order for managers and admins. */
export async function cancelPurchaseOrder(
  id: string,
  user: AuthenticatedUser,
  ip: string | undefined,
): Promise<PurchaseOrderRecord> {
  return prisma.$transaction(async (transaction) => {
    const before = await transaction.purchaseOrder.findUnique({
      where: { id },
      select: purchaseOrderSelect,
    });
    if (!before) {
      throw new AppError(
        404,
        "PURCHASE_ORDER_NOT_FOUND",
        "Purchase order not found",
      );
    }
    scopeOrderBranch(user, before.branchId);
    if (before.status !== "DRAFT" && before.status !== "APPROVED") {
      throw new AppError(
        409,
        "PURCHASE_ORDER_NOT_CANCELLABLE",
        "Only draft or approved purchase orders can be cancelled",
      );
    }
    if (user.role === "STOREKEEPER" && before.status !== "DRAFT") {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Storekeepers can only cancel draft purchase orders",
      );
    }
    const allowedStatuses: PurchaseOrderStatus[] =
      user.role === "STOREKEEPER" ? ["DRAFT"] : ["DRAFT", "APPROVED"];
    const cancellationLock = await transaction.purchaseOrder.updateMany({
      where: { id, status: { in: allowedStatuses } },
      data: { updatedAt: new Date() },
    });
    if (cancellationLock.count !== 1) {
      throw new AppError(
        409,
        "PURCHASE_ORDER_NOT_CANCELLABLE",
        "Purchase order status changed and it can no longer be cancelled",
      );
    }
    const after = await transaction.purchaseOrder.update({
      where: { id },
      data: { status: "CANCELLED" },
      select: purchaseOrderSelect,
    });
    await writeAuditLog(
      {
        userId: user.id,
        action: "CANCEL",
        entity: "PurchaseOrder",
        entityId: id,
        before: auditPurchaseOrder(before),
        after: auditPurchaseOrder(after),
        ip,
      },
      transaction,
    );
    return after;
  });
}
