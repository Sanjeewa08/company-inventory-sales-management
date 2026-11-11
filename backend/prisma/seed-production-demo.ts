import { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/prisma/client";
import { writeAuditLog } from "../src/modules/audit/audit.service";
import {
  getBranchComparisonReport,
  getOutstandingPaymentsReport,
  getSalesReport,
  getStockValuationReport,
  getTopProductsReport,
} from "../src/modules/reports/reports.service";
import { refreshLowStockAlert } from "../src/modules/stock/stock.service";
import { createBranchSchema } from "../src/modules/branches/branches.schema";
import { createCategorySchema } from "../src/modules/categories/categories.schema";
import { createCustomerSchema } from "../src/modules/customers/customers.schema";
import {
  createInvoiceSchema,
  createPaymentSchema,
} from "../src/modules/invoices/invoices.schema";
import { createProductSchema } from "../src/modules/products/products.schema";
import {
  createPurchaseOrderSchema,
  receivePurchaseOrderSchema,
} from "../src/modules/purchase-orders/purchase-orders.schema";
import { createQuotationSchema } from "../src/modules/quotations/quotations.schema";
import { createSupplierSchema } from "../src/modules/suppliers/suppliers.schema";
import {
  demoBranches,
  demoCategories,
  demoCustomers,
  demoProducts,
  demoSuppliers,
  productionDemoRecordCounts,
  productionDemoVersion,
} from "./production-demo-fixtures";

const SEED_NOTE = `DEMO-DATA:${productionDemoVersion}`;
const ADVISORY_LOCK_KEY = 202_611_112;
const EXPECTED_MOVEMENTS = 48;
const EXPECTED_AUDIT_LOGS = 103;

type Transaction = Prisma.TransactionClient;
type AuditIdCollector = string[];
type DemoProduct = {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  costPrice: Prisma.Decimal;
  sellingPrice: Prisma.Decimal;
  reorderLevel: number;
};
type DemoOrder = {
  id: string;
  key: string;
  branchId: string;
  status: string;
  items: Array<{
    id: string;
    productId: string;
    sku: string;
    quantity: number;
    receivedQuantity: number;
    unitCost: Prisma.Decimal;
  }>;
};
type DemoQuotation = {
  id: string;
  key: string;
  status: string;
  customerId: string;
  branchId: string;
  subtotal: Prisma.Decimal;
  tax: Prisma.Decimal;
  total: Prisma.Decimal;
  items: Array<{
    productId: string;
    sku: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
  }>;
};

const fixedNow = new Date();
const currentYear = fixedNow.getFullYear();

function daysAgo(days: number): Date {
  return new Date(fixedNow.getTime() - days * 24 * 60 * 60 * 1000);
}

function daysFromNow(days: number): Date {
  return new Date(fixedNow.getTime() + days * 24 * 60 * 60 * 1000);
}

function money(value: Prisma.Decimal | string | number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function moneyString(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function getOpeningQuantity(productIndex: number, branchIndex: number): number {
  if (productIndex === 0 && branchIndex === 1) return 3;
  if (productIndex === 1 && branchIndex === 1) return 0;
  return 28 + ((productIndex * 7 + branchIndex * 11) % 25);
}

function auditState(
  values: Record<string, string | number | boolean | null>,
): Prisma.InputJsonObject {
  return values;
}

async function writeSeedAudit(
  transaction: Transaction,
  auditIds: AuditIdCollector,
  entry: Parameters<typeof writeAuditLog>[0],
): Promise<void> {
  auditIds.push(entry.entityId);
  await writeAuditLog(entry, transaction);
}

async function ensureNoReservedNameCollisions(
  transaction: Transaction,
): Promise<void> {
  const collisions: string[] = [];
  const checks = await Promise.all([
    transaction.branch.count({
      where: { name: { in: demoBranches.map((branch) => branch.name) } },
    }),
    transaction.category.count({
      where: { name: { in: demoCategories.map((category) => category.name) } },
    }),
    transaction.supplier.count({
      where: {
        OR: [
          { name: { in: demoSuppliers.map((supplier) => supplier.name) } },
          { email: { in: demoSuppliers.map((supplier) => supplier.email) } },
        ],
      },
    }),
    transaction.customer.count({
      where: {
        OR: [
          { name: { in: demoCustomers.map((customer) => customer.name) } },
          { email: { in: demoCustomers.map((customer) => customer.email) } },
        ],
      },
    }),
    transaction.product.count({
      where: { sku: { in: demoProducts.map((product) => product.sku) } },
    }),
  ]);
  if (checks[0] > 0) collisions.push("branch names");
  if (checks[1] > 0) collisions.push("category names");
  if (checks[2] > 0) collisions.push("supplier names or emails");
  if (checks[3] > 0) collisions.push("customer names or emails");
  if (checks[4] > 0) collisions.push("product SKUs");

  if (collisions.length > 0) {
    throw new Error(
      `Production demo seed stopped before writing: reserved ${collisions.join(", ")} already exist. Existing records were not changed.`,
    );
  }
}

async function checkDocumentNumberCollisions(
  transaction: Transaction,
  type: "PURCHASE_ORDER" | "GOODS_RECEIPT" | "QUOTATION" | "INVOICE",
  prefix: string,
  count: number,
): Promise<string[]> {
  const sequence = await transaction.documentSequence.findUnique({
    where: { type_year: { type, year: currentYear } },
    select: { nextValue: true },
  });
  const start = sequence?.nextValue ?? 1;
  const numbers = Array.from(
    { length: count },
    (_, index) =>
      `${prefix}-${currentYear}-${String(start + index).padStart(4, "0")}`,
  );
  const where = { number: { in: numbers } };
  const existingCount =
    type === "PURCHASE_ORDER"
      ? await transaction.purchaseOrder.count({ where })
      : type === "GOODS_RECEIPT"
        ? await transaction.goodsReceipt.count({ where })
        : type === "QUOTATION"
          ? await transaction.quotation.count({ where })
          : await transaction.invoice.count({ where });
  if (existingCount > 0) {
    throw new Error(
      `Production demo seed stopped before writing: the ${prefix} document sequence overlaps existing records. No sequence or business records were changed.`,
    );
  }
  return numbers;
}

async function planDocumentNumbers(transaction: Transaction) {
  const [purchaseOrders, goodsReceipts, quotations, invoices] =
    await Promise.all([
      checkDocumentNumberCollisions(transaction, "PURCHASE_ORDER", "PO", 3),
      checkDocumentNumberCollisions(transaction, "GOODS_RECEIPT", "GRN", 2),
      checkDocumentNumberCollisions(transaction, "QUOTATION", "QT", 3),
      checkDocumentNumberCollisions(transaction, "INVOICE", "INV", 5),
    ]);
  return { purchaseOrders, goodsReceipts, quotations, invoices };
}

async function allocateDocumentNumber(
  transaction: Transaction,
  type: "PURCHASE_ORDER" | "GOODS_RECEIPT" | "QUOTATION" | "INVOICE",
  prefix: string,
): Promise<string> {
  const sequence = await transaction.documentSequence.upsert({
    where: { type_year: { type, year: currentYear } },
    create: { type, year: currentYear, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
    select: { nextValue: true },
  });
  const number = `${prefix}-${currentYear}-${String(sequence.nextValue - 1).padStart(4, "0")}`;
  const exists =
    type === "PURCHASE_ORDER"
      ? await transaction.purchaseOrder.findUnique({
          where: { number },
          select: { id: true },
        })
      : type === "GOODS_RECEIPT"
        ? await transaction.goodsReceipt.findUnique({
            where: { number },
            select: { id: true },
          })
        : type === "QUOTATION"
          ? await transaction.quotation.findUnique({
              where: { number },
              select: { id: true },
            })
          : await transaction.invoice.findUnique({
              where: { number },
              select: { id: true },
            });
  if (exists) {
    throw new Error(
      `Production demo seed stopped because the next ${prefix} number is already in use. The transaction will be rolled back.`,
    );
  }
  return number;
}

async function changeStock(
  transaction: Transaction,
  auditIds: AuditIdCollector,
  input: {
    product: DemoProduct;
    branchId: string;
    quantity: number;
    direction: "increment" | "decrement";
    movementType: "PURCHASE" | "SALE";
    referenceType: "GoodsReceipt" | "Invoice";
    referenceId: string;
    notes: string;
    occurredAt: Date;
    actorId: string;
  },
): Promise<number> {
  const stock = await transaction.stock.update({
    where: {
      productId_branchId: {
        productId: input.product.id,
        branchId: input.branchId,
      },
    },
    data: {
      quantity:
        input.direction === "increment"
          ? { increment: input.quantity }
          : { decrement: input.quantity },
    },
    select: { quantity: true },
  });
  if (stock.quantity < 0) {
    throw new Error(
      `Production demo seed would make ${input.product.sku} stock negative; the transaction will be rolled back.`,
    );
  }
  await transaction.stockMovement.create({
    data: {
      productId: input.product.id,
      branchId: input.branchId,
      userId: input.actorId,
      type: input.movementType,
      quantity: input.quantity,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      notes: `${SEED_NOTE} ${input.notes}`,
      createdAt: input.occurredAt,
    },
  });
  await refreshLowStockAlert(
    transaction,
    input.branchId,
    input.product,
    stock.quantity,
    input.actorId,
  );
  return stock.quantity;
}

async function createReceipt(
  transaction: Transaction,
  auditIds: AuditIdCollector,
  actorId: string,
  order: DemoOrder,
  receivedAt: Date,
  requestedItems: Array<{ sku: string; quantity: number }>,
  productsBySku: Map<string, DemoProduct>,
  branchKeyById: Map<string, string>,
  stockLevels: Map<string, number>,
): Promise<void> {
  const received = receivePurchaseOrderSchema.parse({
    notes: `${SEED_NOTE} Fictional demonstration receipt.`,
    items: requestedItems.map((requested) => {
      const item = order.items.find(
        (candidate) => candidate.sku === requested.sku,
      );
      if (!item) {
        throw new Error(`Unknown purchase-order item ${requested.sku}.`);
      }
      return {
        purchaseOrderItemId: item.id,
        quantity: requested.quantity,
      };
    }),
  });
  const itemMap = new Map(order.items.map((item) => [item.id, item]));
  const receiptItems = received.items.map((item) => {
    const orderItem = itemMap.get(item.purchaseOrderItemId);
    if (
      !orderItem ||
      item.quantity > orderItem.quantity - orderItem.receivedQuantity
    ) {
      throw new Error(
        "The demonstration receipt exceeds the ordered quantity.",
      );
    }
    return { orderItem, quantity: item.quantity };
  });
  const number = await allocateDocumentNumber(
    transaction,
    "GOODS_RECEIPT",
    "GRN",
  );
  const receipt = await transaction.goodsReceipt.create({
    data: {
      number,
      purchaseOrderId: order.id,
      branchId: order.branchId,
      receivedById: actorId,
      receivedAt,
      notes: received.notes,
      items: {
        create: receiptItems.map(({ orderItem, quantity }) => ({
          purchaseOrderItemId: orderItem.id,
          quantity,
          unitCost: orderItem.unitCost,
        })),
      },
    },
    include: { items: true },
  });

  for (const { orderItem, quantity } of receiptItems) {
    await transaction.purchaseOrderItem.update({
      where: { id: orderItem.id },
      data: { receivedQuantity: { increment: quantity } },
    });
    const product = productsBySku.get(orderItem.sku);
    if (!product) throw new Error(`Missing product ${orderItem.sku}.`);
    const newQuantity = await changeStock(transaction, auditIds, {
      product,
      branchId: order.branchId,
      quantity,
      direction: "increment",
      movementType: "PURCHASE",
      referenceType: "GoodsReceipt",
      referenceId: receipt.id,
      notes: `Received ${quantity} units for ${number}.`,
      occurredAt: receivedAt,
      actorId,
    });
    stockLevels.set(`${order.branchId}:${product.id}`, newQuantity);
  }

  const updatedItems = await transaction.purchaseOrderItem.findMany({
    where: { purchaseOrderId: order.id },
    select: { quantity: true, receivedQuantity: true },
  });
  const fullyReceived = updatedItems.every(
    (item) => item.receivedQuantity >= item.quantity,
  );
  const beforeStatus = order.status;
  const updatedOrder = await transaction.purchaseOrder.update({
    where: { id: order.id },
    data: { status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" },
    select: { id: true, number: true, status: true },
  });
  order.status = updatedOrder.status;
  for (const receiptItem of receiptItems) {
    const item = order.items.find(
      (candidate) => candidate.id === receiptItem.orderItem.id,
    );
    if (item) item.receivedQuantity += receiptItem.quantity;
  }
  const branchKey = branchKeyById.get(order.branchId);
  await writeSeedAudit(transaction, auditIds, {
    userId: actorId,
    action: "CREATE",
    entity: "GoodsReceipt",
    entityId: receipt.id,
    after: auditState({
      id: receipt.id,
      number: receipt.number,
      purchaseOrderId: receipt.purchaseOrderId,
      branchId: receipt.branchId,
      branchKey: branchKey ?? null,
      itemCount: receipt.items.length,
      status: updatedOrder.status,
    }),
  });
  await writeSeedAudit(transaction, auditIds, {
    userId: actorId,
    action: "UPDATE",
    entity: "PurchaseOrder",
    entityId: order.id,
    before: auditState({ id: order.id, status: beforeStatus }),
    after: auditState({
      id: updatedOrder.id,
      number: updatedOrder.number,
      status: updatedOrder.status,
    }),
  });
}

function invoiceAuditState(invoice: {
  id: string;
  number: string;
  customerId: string;
  branchId: string;
  quotationId: string | null;
  status: string;
  subtotal: Prisma.Decimal;
  discount: Prisma.Decimal;
  tax: Prisma.Decimal;
  total: Prisma.Decimal;
  issuedAt: Date;
}): Prisma.InputJsonObject {
  return {
    id: invoice.id,
    number: invoice.number,
    customerId: invoice.customerId,
    branchId: invoice.branchId,
    quotationId: invoice.quotationId,
    status: invoice.status,
    subtotal: moneyString(invoice.subtotal),
    discount: moneyString(invoice.discount),
    tax: moneyString(invoice.tax),
    total: moneyString(invoice.total),
    issuedAt: invoice.issuedAt.toISOString(),
  };
}

async function verifyCreatedData(
  transaction: Transaction,
  ids: {
    branchIds: string[];
    categoryIds: string[];
    supplierIds: string[];
    customerIds: string[];
    productIds: string[];
    stockIds: string[];
    purchaseOrderIds: string[];
    goodsReceiptIds: string[];
    quotationIds: string[];
    invoiceIds: string[];
    paymentIds: string[];
    auditIds: string[];
  },
): Promise<void> {
  const [
    branches,
    categories,
    suppliers,
    customers,
    products,
    stockRows,
    movements,
    purchaseOrders,
    goodsReceipts,
    quotations,
    invoices,
    payments,
    activeAlerts,
    auditLogs,
  ] = await Promise.all([
    transaction.branch.count({ where: { id: { in: ids.branchIds } } }),
    transaction.category.count({ where: { id: { in: ids.categoryIds } } }),
    transaction.supplier.count({ where: { id: { in: ids.supplierIds } } }),
    transaction.customer.count({ where: { id: { in: ids.customerIds } } }),
    transaction.product.count({ where: { id: { in: ids.productIds } } }),
    transaction.stock.count({ where: { id: { in: ids.stockIds } } }),
    transaction.stockMovement.count({
      where: { notes: { contains: SEED_NOTE } },
    }),
    transaction.purchaseOrder.count({
      where: { id: { in: ids.purchaseOrderIds } },
    }),
    transaction.goodsReceipt.count({
      where: { id: { in: ids.goodsReceiptIds } },
    }),
    transaction.quotation.count({ where: { id: { in: ids.quotationIds } } }),
    transaction.invoice.count({ where: { id: { in: ids.invoiceIds } } }),
    transaction.payment.count({ where: { id: { in: ids.paymentIds } } }),
    transaction.alert.count({
      where: {
        branchId: { in: ids.branchIds },
        productId: { in: ids.productIds },
        type: "LOW_STOCK",
        resolvedAt: null,
      },
    }),
    transaction.auditLog.count({ where: { entityId: { in: ids.auditIds } } }),
  ]);
  const actual = {
    branches,
    categories,
    suppliers,
    customers,
    products,
    stockRows,
    movements,
    purchaseOrders,
    goodsReceipts,
    quotations,
    invoices,
    payments,
    activeAlerts,
    auditLogs,
  };
  const expected = {
    branches: productionDemoRecordCounts.branches,
    categories: productionDemoRecordCounts.categories,
    suppliers: productionDemoRecordCounts.suppliers,
    customers: productionDemoRecordCounts.customers,
    products: productionDemoRecordCounts.products,
    stockRows: productionDemoRecordCounts.stockRows,
    movements: EXPECTED_MOVEMENTS,
    purchaseOrders: productionDemoRecordCounts.purchaseOrders,
    goodsReceipts: productionDemoRecordCounts.goodsReceipts,
    quotations: productionDemoRecordCounts.quotations,
    invoices: productionDemoRecordCounts.invoices,
    payments: productionDemoRecordCounts.payments,
    activeAlerts: productionDemoRecordCounts.activeLowStockAlerts,
    auditLogs: EXPECTED_AUDIT_LOGS,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Production demo seed verification failed; expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}. The transaction will be rolled back.`,
    );
  }

  const [invoiceStatuses, quotationStatuses, orderStatuses] = await Promise.all(
    [
      transaction.invoice.groupBy({
        by: ["status"],
        where: { id: { in: ids.invoiceIds } },
        _count: { _all: true },
      }),
      transaction.quotation.groupBy({
        by: ["status"],
        where: { id: { in: ids.quotationIds } },
        _count: { _all: true },
      }),
      transaction.purchaseOrder.groupBy({
        by: ["status"],
        where: { id: { in: ids.purchaseOrderIds } },
        _count: { _all: true },
      }),
    ],
  );
  const invoiceStatusCounts = Object.fromEntries(
    invoiceStatuses.map((row) => [row.status, row._count._all]),
  );
  const quotationStatusCounts = Object.fromEntries(
    quotationStatuses.map((row) => [row.status, row._count._all]),
  );
  const orderStatusCounts = Object.fromEntries(
    orderStatuses.map((row) => [row.status, row._count._all]),
  );
  const matchesCounts = (
    actualCounts: Record<string, number>,
    expectedCounts: Record<string, number>,
  ) =>
    Object.keys(actualCounts).length === Object.keys(expectedCounts).length &&
    Object.entries(expectedCounts).every(
      ([status, count]) => actualCounts[status] === count,
    );
  if (
    !matchesCounts(invoiceStatusCounts, { PAID: 1, PARTIAL: 1, PENDING: 3 }) ||
    !matchesCounts(quotationStatusCounts, {
      CONVERTED: 1,
      DRAFT: 1,
      SENT: 1,
    }) ||
    !matchesCounts(orderStatusCounts, {
      APPROVED: 1,
      PARTIALLY_RECEIVED: 1,
      RECEIVED: 1,
    })
  ) {
    throw new Error(
      "Production demo seed verification found unexpected document statuses. The transaction will be rolled back.",
    );
  }
}

async function seedProductionDemo(dryRun: boolean) {
  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      "Production demo data can only be seeded when NODE_ENV=production.",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be configured for this operation.");
  }

  return prisma.$transaction(
    async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`;
      const marker = await transaction.auditLog.findFirst({
        where: {
          entity: "ProductionDemoDataset",
          entityId: productionDemoVersion,
          action: "CREATE",
        },
        select: { id: true },
      });
      if (marker) {
        return {
          status: "already-seeded",
          version: productionDemoVersion,
          created: {},
        };
      }

      const admin = await transaction.user.findFirst({
        where: { role: "ADMIN", isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!admin) {
        throw new Error(
          "An active ADMIN account is required. No account or business record was created.",
        );
      }
      await ensureNoReservedNameCollisions(transaction);
      const documentNumbers = await planDocumentNumbers(transaction);
      if (dryRun) {
        return {
          status: "ready",
          version: productionDemoVersion,
          creates: {
            ...productionDemoRecordCounts,
            stockMovements: EXPECTED_MOVEMENTS,
            auditLogs: EXPECTED_AUDIT_LOGS,
            documentSequenceAllocations: 13,
          },
          documentNumbers,
          existingAdminAccountsChanged: 0,
          existingBusinessRecordsChanged: 0,
          deletes: 0,
          overwrites: 0,
        };
      }

      const auditIds: AuditIdCollector = [];
      const branchByKey = new Map<string, { id: string; name: string }>();
      for (const fixture of demoBranches) {
        const input = createBranchSchema.parse({
          name: fixture.name,
          address: fixture.address,
          phone: null,
        });
        const branch = await transaction.branch.create({
          data: input,
          select: { id: true, name: true },
        });
        branchByKey.set(fixture.key, branch);
        await writeSeedAudit(transaction, auditIds, {
          userId: admin.id,
          action: "CREATE",
          entity: "Branch",
          entityId: branch.id,
          after: auditState({
            id: branch.id,
            name: branch.name,
            isActive: true,
            demoDataset: productionDemoVersion,
          }),
        });
      }

      const categoryByKey = new Map<string, { id: string; name: string }>();
      for (const fixture of demoCategories) {
        const input = createCategorySchema.parse({
          name: fixture.name,
          description: fixture.description,
        });
        const category = await transaction.category.create({
          data: input,
          select: { id: true, name: true },
        });
        categoryByKey.set(fixture.key, category);
        await writeSeedAudit(transaction, auditIds, {
          userId: admin.id,
          action: "CREATE",
          entity: "Category",
          entityId: category.id,
          after: auditState({
            id: category.id,
            name: category.name,
            isActive: true,
            demoDataset: productionDemoVersion,
          }),
        });
      }

      const supplierByIndex: Array<{ id: string; name: string }> = [];
      for (const fixture of demoSuppliers) {
        const input = createSupplierSchema.parse({
          name: fixture.name,
          email: fixture.email,
          address: fixture.address,
        });
        const supplier = await transaction.supplier.create({
          data: input,
          select: { id: true, name: true },
        });
        supplierByIndex.push(supplier);
        await writeSeedAudit(transaction, auditIds, {
          userId: admin.id,
          action: "CREATE",
          entity: "Supplier",
          entityId: supplier.id,
          after: auditState({
            id: supplier.id,
            name: supplier.name,
            isActive: true,
            demoDataset: productionDemoVersion,
          }),
        });
      }

      const customerByIndex: Array<{ id: string; name: string }> = [];
      for (const fixture of demoCustomers) {
        const input = createCustomerSchema.parse({
          name: fixture.name,
          email: fixture.email,
          address: fixture.address,
        });
        const customer = await transaction.customer.create({
          data: input,
          select: { id: true, name: true },
        });
        customerByIndex.push(customer);
        await writeSeedAudit(transaction, auditIds, {
          userId: admin.id,
          action: "CREATE",
          entity: "Customer",
          entityId: customer.id,
          after: auditState({
            id: customer.id,
            name: customer.name,
            isActive: true,
            demoDataset: productionDemoVersion,
          }),
        });
      }

      const productBySku = new Map<string, DemoProduct>();
      const productsInOrder: DemoProduct[] = [];
      for (const fixture of demoProducts) {
        const category = categoryByKey.get(fixture.categoryKey);
        if (!category)
          throw new Error(`Missing category ${fixture.categoryKey}.`);
        const input = createProductSchema.parse({
          sku: fixture.sku,
          name: fixture.name,
          description: `Fictional inventory item for ${productionDemoVersion}.`,
          unit: fixture.unit,
          categoryId: category.id,
          costPrice: fixture.costPrice,
          sellingPrice: fixture.sellingPrice,
          reorderLevel: fixture.reorderLevel,
        });
        const product = await transaction.product.create({
          data: input,
          select: {
            id: true,
            sku: true,
            name: true,
            categoryId: true,
            costPrice: true,
            sellingPrice: true,
            reorderLevel: true,
          },
        });
        productBySku.set(product.sku, product);
        productsInOrder.push(product);
        await writeSeedAudit(transaction, auditIds, {
          userId: admin.id,
          action: "CREATE",
          entity: "Product",
          entityId: product.id,
          after: auditState({
            id: product.id,
            sku: product.sku,
            name: product.name,
            categoryId: product.categoryId,
            costPrice: moneyString(product.costPrice),
            sellingPrice: moneyString(product.sellingPrice),
            reorderLevel: product.reorderLevel,
            isActive: true,
          }),
        });
      }

      const stockIds: string[] = [];
      const stockLevels = new Map<string, number>();
      for (
        let productIndex = 0;
        productIndex < productsInOrder.length;
        productIndex++
      ) {
        const product = productsInOrder[productIndex];
        for (
          let branchIndex = 0;
          branchIndex < demoBranches.length;
          branchIndex++
        ) {
          const branch = branchByKey.get(demoBranches[branchIndex].key);
          if (!branch) throw new Error("Missing demonstration branch.");
          const quantity = getOpeningQuantity(productIndex, branchIndex);
          const stock = await transaction.stock.create({
            data: {
              productId: product.id,
              branchId: branch.id,
              quantity,
            },
            select: { id: true },
          });
          stockIds.push(stock.id);
          stockLevels.set(`${branch.id}:${product.id}`, quantity);
          await writeSeedAudit(transaction, auditIds, {
            userId: admin.id,
            action: "CREATE",
            entity: "Stock",
            entityId: stock.id,
            after: auditState({
              id: stock.id,
              productId: product.id,
              branchId: branch.id,
              quantity,
              reason: "Fictional production demonstration opening balance",
            }),
          });
          if (quantity > 0) {
            await transaction.stockMovement.create({
              data: {
                productId: product.id,
                branchId: branch.id,
                userId: admin.id,
                type: "ADJUSTMENT",
                quantity,
                referenceType: "ProductionDemoSeed",
                referenceId: productionDemoVersion,
                notes: `${SEED_NOTE} Fictional opening balance.`,
                createdAt: daysAgo(40),
              },
            });
          }
          await refreshLowStockAlert(
            transaction,
            branch.id,
            product,
            quantity,
            admin.id,
          );
        }
      }

      const branchKeyById = new Map(
        [...branchByKey.entries()].map(([key, branch]) => [branch.id, key]),
      );
      const orderPlans = [
        {
          key: "received",
          supplierIndex: 0,
          branchKey: "central",
          orderedDaysAgo: 28,
          itemLines: [
            { sku: "DEMO-DRY-003", quantity: 30, receivedQuantity: 0 },
            { sku: "DEMO-DRY-004", quantity: 18, receivedQuantity: 0 },
          ],
        },
        {
          key: "partial",
          supplierIndex: 1,
          branchKey: "lakeside",
          orderedDaysAgo: 16,
          itemLines: [
            { sku: "DEMO-OFF-001", quantity: 16, receivedQuantity: 0 },
            { sku: "DEMO-OFF-002", quantity: 20, receivedQuantity: 0 },
          ],
        },
        {
          key: "approved",
          supplierIndex: 2,
          branchKey: "central",
          orderedDaysAgo: 5,
          itemLines: [
            { sku: "DEMO-OFF-003", quantity: 10, receivedQuantity: 0 },
            { sku: "DEMO-OFF-004", quantity: 12, receivedQuantity: 0 },
          ],
        },
      ] as const;
      const ordersByKey = new Map<string, DemoOrder>();
      const purchaseOrderIds: string[] = [];
      for (const plan of orderPlans) {
        const supplier = supplierByIndex[plan.supplierIndex];
        const branch = branchByKey.get(plan.branchKey);
        if (!supplier || !branch)
          throw new Error("Missing purchase-order relation.");
        const input = createPurchaseOrderSchema.parse({
          supplierId: supplier.id,
          branchId: branch.id,
          expectedAt: daysFromNow(14 - plan.orderedDaysAgo),
          notes: `${SEED_NOTE} Fictional supplier replenishment.`,
          tax: "0.00",
          items: plan.itemLines.map(({ sku, quantity }) => {
            const product = productBySku.get(sku);
            if (!product) throw new Error(`Missing product ${sku}.`);
            return {
              productId: product.id,
              quantity,
              unitCost: moneyString(product.costPrice),
            };
          }),
        });
        const items = input.items.map((item, index) => {
          const product = productsInOrder.find(
            (candidate) => candidate.id === item.productId,
          );
          if (!product) throw new Error("Missing purchase-order product.");
          return {
            product,
            quantity: item.quantity,
            unitCost: money(item.unitCost),
            lineTotal: money(item.unitCost).mul(item.quantity),
            receivedQuantity: 0,
            sku: plan.itemLines[index].sku,
          };
        });
        const subtotal = items.reduce(
          (sum, item) => sum.plus(item.lineTotal),
          money(0),
        );
        const tax = money(input.tax);
        const total = subtotal.plus(tax);
        const orderedAt = daysAgo(plan.orderedDaysAgo);
        const number = await allocateDocumentNumber(
          transaction,
          "PURCHASE_ORDER",
          "PO",
        );
        const createdOrder = await transaction.purchaseOrder.create({
          data: {
            number,
            supplierId: supplier.id,
            branchId: branch.id,
            createdById: admin.id,
            status: "DRAFT",
            orderedAt,
            expectedAt: input.expectedAt,
            notes: input.notes,
            subtotal,
            tax,
            total,
            createdAt: orderedAt,
            items: {
              create: items.map((item) => ({
                productId: item.product.id,
                quantity: item.quantity,
                receivedQuantity: item.receivedQuantity,
                unitCost: item.unitCost,
                lineTotal: item.lineTotal,
              })),
            },
          },
          include: { items: true },
        });
        purchaseOrderIds.push(createdOrder.id);
        await writeSeedAudit(transaction, auditIds, {
          userId: admin.id,
          action: "CREATE",
          entity: "PurchaseOrder",
          entityId: createdOrder.id,
          after: auditState({
            id: createdOrder.id,
            number: createdOrder.number,
            status: createdOrder.status,
            supplierId: supplier.id,
            branchId: branch.id,
            subtotal: moneyString(subtotal),
            tax: moneyString(tax),
            total: moneyString(total),
          }),
        });
        const approvedOrder = await transaction.purchaseOrder.update({
          where: { id: createdOrder.id },
          data: {
            status: "APPROVED",
            approvedById: admin.id,
            approvedAt: orderedAt,
          },
          select: { id: true, number: true, status: true },
        });
        await writeSeedAudit(transaction, auditIds, {
          userId: admin.id,
          action: "APPROVE",
          entity: "PurchaseOrder",
          entityId: createdOrder.id,
          before: auditState({ id: createdOrder.id, status: "DRAFT" }),
          after: auditState({
            id: approvedOrder.id,
            number: approvedOrder.number,
            status: approvedOrder.status,
            approvedById: admin.id,
          }),
        });
        ordersByKey.set(plan.key, {
          id: createdOrder.id,
          key: plan.key,
          branchId: branch.id,
          status: "APPROVED",
          items: createdOrder.items.map((item, index) => ({
            id: item.id,
            productId: item.productId,
            sku: plan.itemLines[index].sku,
            quantity: item.quantity,
            receivedQuantity: item.receivedQuantity,
            unitCost: item.unitCost,
          })),
        });
      }

      const receivedOrder = ordersByKey.get("received");
      const partialOrder = ordersByKey.get("partial");
      if (!receivedOrder || !partialOrder) {
        throw new Error("Missing purchase orders for goods receipts.");
      }
      const goodsReceiptIds: string[] = [];
      const receiptCountBefore = await transaction.goodsReceipt.count({
        where: { purchaseOrderId: { in: purchaseOrderIds } },
      });
      await createReceipt(
        transaction,
        auditIds,
        admin.id,
        receivedOrder,
        daysAgo(20),
        receivedOrder.items.map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
        })),
        productBySku,
        branchKeyById,
        stockLevels,
      );
      await createReceipt(
        transaction,
        auditIds,
        admin.id,
        partialOrder,
        daysAgo(9),
        [{ sku: partialOrder.items[0].sku, quantity: 7 }],
        productBySku,
        branchKeyById,
        stockLevels,
      );
      const createdReceipts = await transaction.goodsReceipt.findMany({
        where: { purchaseOrderId: { in: purchaseOrderIds } },
        select: { id: true },
      });
      goodsReceiptIds.push(...createdReceipts.map((receipt) => receipt.id));
      if (
        goodsReceiptIds.length - receiptCountBefore !==
        productionDemoRecordCounts.goodsReceipts
      ) {
        throw new Error(
          "The expected demonstration receipts were not created.",
        );
      }

      const quotePlans = [
        {
          key: "draft",
          customerIndex: 5,
          branchKey: "central",
          issuedDaysAgo: 8,
          status: "DRAFT" as const,
          items: [
            { sku: "DEMO-SAF-003", quantity: 2 },
            { sku: "DEMO-APP-001", quantity: 1 },
          ],
        },
        {
          key: "sent",
          customerIndex: 6,
          branchKey: "lakeside",
          issuedDaysAgo: 6,
          status: "SENT" as const,
          items: [
            { sku: "DEMO-CLN-002", quantity: 3 },
            { sku: "DEMO-CLN-003", quantity: 4 },
          ],
        },
        {
          key: "converted",
          customerIndex: 0,
          branchKey: "central",
          issuedDaysAgo: 4,
          status: "CONVERTED" as const,
          items: [
            { sku: "DEMO-CLN-001", quantity: 2 },
            { sku: "DEMO-CLN-002", quantity: 1 },
          ],
        },
      ];
      const quotationsByKey = new Map<string, DemoQuotation>();
      const quotationIds: string[] = [];
      for (const plan of quotePlans) {
        const customer = customerByIndex[plan.customerIndex];
        const branch = branchByKey.get(plan.branchKey);
        if (!customer || !branch)
          throw new Error("Missing quotation relation.");
        const requestedSubtotal = plan.items.reduce((sum, item) => {
          const product = productBySku.get(item.sku);
          if (!product) throw new Error(`Missing product ${item.sku}.`);
          return sum.plus(product.sellingPrice.mul(item.quantity));
        }, money(0));
        const requestedTax = requestedSubtotal.mul("0.10").toDecimalPlaces(2);
        const input = createQuotationSchema.parse({
          customerId: customer.id,
          branchId: branch.id,
          validUntil: daysFromNow(30),
          notes: `${SEED_NOTE} Fictional customer quotation.`,
          tax: moneyString(requestedTax),
          items: plan.items.map(({ sku, quantity }) => {
            const product = productBySku.get(sku);
            if (!product) throw new Error(`Missing product ${sku}.`);
            return {
              productId: product.id,
              quantity,
              unitPrice: moneyString(product.sellingPrice),
            };
          }),
        });
        const items = input.items.map((item, index) => {
          const fixture = plan.items[index];
          const product = productBySku.get(fixture.sku);
          if (!product) throw new Error(`Missing product ${fixture.sku}.`);
          const unitPrice = money(item.unitPrice);
          return {
            product,
            quantity: item.quantity,
            unitPrice,
            lineTotal: unitPrice.mul(item.quantity),
          };
        });
        const subtotal = items.reduce(
          (sum, item) => sum.plus(item.lineTotal),
          money(0),
        );
        const tax = subtotal.mul("0.10").toDecimalPlaces(2);
        const total = subtotal.plus(tax);
        const issuedAt = daysAgo(plan.issuedDaysAgo);
        const number = await allocateDocumentNumber(
          transaction,
          "QUOTATION",
          "QT",
        );
        const quotation = await transaction.quotation.create({
          data: {
            number,
            customerId: customer.id,
            branchId: branch.id,
            createdById: admin.id,
            status: "DRAFT",
            issuedAt,
            validUntil: input.validUntil,
            notes: input.notes,
            subtotal,
            tax,
            total,
            createdAt: issuedAt,
            items: {
              create: items.map((item) => ({
                productId: item.product.id,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                lineTotal: item.lineTotal,
              })),
            },
          },
          include: { items: true },
        });
        quotationIds.push(quotation.id);
        await writeSeedAudit(transaction, auditIds, {
          userId: admin.id,
          action: "CREATE",
          entity: "Quotation",
          entityId: quotation.id,
          after: auditState({
            id: quotation.id,
            number: quotation.number,
            status: quotation.status,
            customerId: customer.id,
            branchId: branch.id,
            subtotal: moneyString(subtotal),
            tax: moneyString(tax),
            total: moneyString(total),
          }),
        });
        const demoQuotation: DemoQuotation = {
          id: quotation.id,
          key: plan.key,
          status: "DRAFT",
          customerId: customer.id,
          branchId: branch.id,
          subtotal,
          tax,
          total,
          items: items.map((item) => ({
            productId: item.product.id,
            sku: item.product.sku,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.lineTotal,
          })),
        };
        const transitions =
          plan.status === "DRAFT"
            ? []
            : plan.status === "SENT"
              ? (["SENT"] as const)
              : (["SENT", "ACCEPTED"] as const);
        for (const status of transitions) {
          const beforeStatus = demoQuotation.status;
          const updated = await transaction.quotation.update({
            where: { id: quotation.id },
            data: { status },
            select: { id: true, number: true, status: true },
          });
          demoQuotation.status = updated.status;
          await writeSeedAudit(transaction, auditIds, {
            userId: admin.id,
            action: "UPDATE",
            entity: "Quotation",
            entityId: quotation.id,
            before: auditState({ id: quotation.id, status: beforeStatus }),
            after: auditState({
              id: updated.id,
              number: updated.number,
              status: updated.status,
            }),
          });
        }
        quotationsByKey.set(plan.key, demoQuotation);
      }

      const invoicePlans = [
        {
          key: "converted",
          quotationKey: "converted",
          customerIndex: 0,
          branchKey: "central",
          issuedDaysAgo: 3,
          payment: "PAID" as const,
          manualItems: [],
          discount: "0.00",
        },
        {
          key: "pending-central",
          quotationKey: null,
          customerIndex: 1,
          branchKey: "central",
          issuedDaysAgo: 24,
          payment: null,
          manualItems: [
            { sku: "DEMO-DRY-003", quantity: 4 },
            { sku: "DEMO-DRY-004", quantity: 3 },
          ],
          discount: "0.00",
        },
        {
          key: "partial-lakeside",
          quotationKey: null,
          customerIndex: 2,
          branchKey: "lakeside",
          issuedDaysAgo: 12,
          payment: "PARTIAL" as const,
          manualItems: [
            { sku: "DEMO-OFF-001", quantity: 2 },
            { sku: "DEMO-OFF-002", quantity: 4 },
          ],
          discount: "100.00",
        },
        {
          key: "pending-central-2",
          quotationKey: null,
          customerIndex: 3,
          branchKey: "central",
          issuedDaysAgo: 7,
          payment: null,
          manualItems: [
            { sku: "DEMO-OFF-003", quantity: 2 },
            { sku: "DEMO-OFF-004", quantity: 1 },
          ],
          discount: "0.00",
        },
        {
          key: "pending-lakeside",
          quotationKey: null,
          customerIndex: 4,
          branchKey: "lakeside",
          issuedDaysAgo: 1,
          payment: null,
          manualItems: [
            { sku: "DEMO-CLN-003", quantity: 2 },
            { sku: "DEMO-CLN-004", quantity: 1 },
          ],
          discount: "0.00",
        },
      ];
      const invoiceIds: string[] = [];
      const paymentIds: string[] = [];
      for (const plan of invoicePlans) {
        const issuedAt = daysAgo(plan.issuedDaysAgo);
        const dueAt = new Date(issuedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
        const notes = `${SEED_NOTE} Fictional customer sale.`;
        const quotation =
          typeof plan.quotationKey === "string"
            ? quotationsByKey.get(plan.quotationKey)
            : undefined;
        if (typeof plan.quotationKey === "string" && !quotation) {
          throw new Error("Missing accepted demonstration quotation.");
        }
        const customer = customerByIndex[plan.customerIndex];
        const branch = branchByKey.get(plan.branchKey);
        if (!customer || !branch) throw new Error("Missing invoice relation.");

        let lineItems: Array<{
          product: DemoProduct;
          quantity: number;
          unitPrice: Prisma.Decimal;
          lineTotal: Prisma.Decimal;
        }>;
        let subtotal: Prisma.Decimal;
        let discount: Prisma.Decimal;
        let tax: Prisma.Decimal;
        let total: Prisma.Decimal;
        let quotationId: string | null = null;
        if (quotation) {
          const validated = createInvoiceSchema.parse({
            quotationId: quotation.id,
            dueAt,
            notes,
          });
          if (!("quotationId" in validated)) {
            throw new Error(
              "Quotation invoice validation returned invalid data.",
            );
          }
          lineItems = quotation.items.map((item) => {
            const product = productBySku.get(item.sku);
            if (!product) throw new Error(`Missing product ${item.sku}.`);
            return {
              product,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
            };
          });
          subtotal = quotation.subtotal;
          discount = money(0);
          tax = quotation.tax;
          total = quotation.total;
          quotationId = quotation.id;
        } else {
          const itemInputs = plan.manualItems.map(({ sku, quantity }) => {
            const product = productBySku.get(sku);
            if (!product) throw new Error(`Missing product ${sku}.`);
            return {
              productId: product.id,
              quantity,
              unitPrice: moneyString(product.sellingPrice),
            };
          });
          const requestedSubtotal = itemInputs.reduce(
            (sum, item) => sum.plus(money(item.unitPrice).mul(item.quantity)),
            money(0),
          );
          const requestedTax = requestedSubtotal.mul("0.18").toDecimalPlaces(2);
          createInvoiceSchema.parse({
            customerId: customer.id,
            branchId: branch.id,
            dueAt,
            notes,
            discount: plan.discount,
            tax: moneyString(requestedTax),
            items: itemInputs,
          });
          lineItems = itemInputs.map((item, index) => {
            const fixture = plan.manualItems[index];
            const product = productBySku.get(fixture.sku);
            if (!product) throw new Error(`Missing product ${fixture.sku}.`);
            const unitPrice = money(item.unitPrice);
            return {
              product,
              quantity: item.quantity,
              unitPrice,
              lineTotal: unitPrice.mul(item.quantity),
            };
          });
          subtotal = lineItems.reduce(
            (sum, item) => sum.plus(item.lineTotal),
            money(0),
          );
          discount = money(plan.discount);
          tax = requestedTax;
          total = subtotal.minus(discount).plus(tax);
        }

        const number = await allocateDocumentNumber(
          transaction,
          "INVOICE",
          "INV",
        );
        const invoice = await transaction.invoice.create({
          data: {
            number,
            customerId: customer.id,
            branchId: branch.id,
            quotationId,
            createdById: admin.id,
            status: "PENDING",
            issuedAt,
            dueAt,
            notes,
            subtotal,
            discount,
            tax,
            total,
            createdAt: issuedAt,
            items: {
              create: lineItems.map((item) => ({
                productId: item.product.id,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                lineTotal: item.lineTotal,
              })),
            },
          },
        });
        invoiceIds.push(invoice.id);
        for (const item of lineItems) {
          const stockKey = `${branch.id}:${item.product.id}`;
          const previousQuantity = stockLevels.get(stockKey);
          if (
            previousQuantity === undefined ||
            previousQuantity < item.quantity
          ) {
            throw new Error(
              `Insufficient demonstration stock for ${item.product.sku}.`,
            );
          }
          const currentQuantity = await changeStock(transaction, auditIds, {
            product: item.product,
            branchId: branch.id,
            quantity: item.quantity,
            direction: "decrement",
            movementType: "SALE",
            referenceType: "Invoice",
            referenceId: invoice.id,
            notes: `Sold ${item.quantity} units on ${number}.`,
            occurredAt: issuedAt,
            actorId: admin.id,
          });
          stockLevels.set(stockKey, currentQuantity);
        }
        await writeSeedAudit(transaction, auditIds, {
          userId: admin.id,
          action: "CREATE",
          entity: "Invoice",
          entityId: invoice.id,
          after: invoiceAuditState({
            ...invoice,
            status: invoice.status,
          }),
        });

        if (quotation) {
          const beforeStatus = quotation.status;
          const updatedQuotation = await transaction.quotation.update({
            where: { id: quotation.id },
            data: { status: "CONVERTED" },
            select: { id: true, number: true, status: true },
          });
          quotation.status = updatedQuotation.status;
          await writeSeedAudit(transaction, auditIds, {
            userId: admin.id,
            action: "UPDATE",
            entity: "Quotation",
            entityId: quotation.id,
            before: auditState({
              id: quotation.id,
              number: updatedQuotation.number,
              status: beforeStatus,
              invoiceId: null,
            }),
            after: auditState({
              id: updatedQuotation.id,
              number: updatedQuotation.number,
              status: updatedQuotation.status,
              invoiceId: invoice.id,
            }),
          });
        }

        if (plan.payment) {
          const amount =
            plan.payment === "PAID" ? total : total.div(2).toDecimalPlaces(2);
          const paymentInput = createPaymentSchema.parse({
            amount: moneyString(amount),
            method: plan.payment === "PAID" ? "BANK_TRANSFER" : "CARD",
            reference: `DEMO-TRX-${number}`,
            notes: `${SEED_NOTE} Fictional payment.`,
          });
          const payment = await transaction.payment.create({
            data: {
              invoiceId: invoice.id,
              receivedById: admin.id,
              amount: money(paymentInput.amount),
              method: paymentInput.method,
              reference: paymentInput.reference,
              notes: paymentInput.notes,
              receivedAt: new Date(
                issuedAt.getTime() + 2 * 24 * 60 * 60 * 1000,
              ),
            },
          });
          paymentIds.push(payment.id);
          const newStatus = plan.payment === "PAID" ? "PAID" : "PARTIAL";
          const updatedInvoice = await transaction.invoice.update({
            where: { id: invoice.id },
            data: { status: newStatus },
          });
          await writeSeedAudit(transaction, auditIds, {
            userId: admin.id,
            action: "CREATE",
            entity: "Payment",
            entityId: payment.id,
            after: auditState({
              id: payment.id,
              invoiceId: invoice.id,
              amount: moneyString(payment.amount),
              method: payment.method,
              reference: payment.reference,
            }),
          });
          await writeSeedAudit(transaction, auditIds, {
            userId: admin.id,
            action: "UPDATE",
            entity: "Invoice",
            entityId: invoice.id,
            before: invoiceAuditState({ ...invoice, status: "PENDING" }),
            after: invoiceAuditState({
              ...updatedInvoice,
              status: updatedInvoice.status,
            }),
          });
        }
      }

      for (const product of productsInOrder) {
        for (const branchFixture of demoBranches) {
          const branch = branchByKey.get(branchFixture.key);
          if (!branch) throw new Error("Missing demonstration branch.");
          const quantity = stockLevels.get(`${branch.id}:${product.id}`);
          if (quantity === undefined) throw new Error("Missing stock balance.");
          await refreshLowStockAlert(
            transaction,
            branch.id,
            product,
            quantity,
            admin.id,
          );
        }
      }

      await writeSeedAudit(transaction, auditIds, {
        userId: admin.id,
        action: "CREATE",
        entity: "ProductionDemoDataset",
        entityId: productionDemoVersion,
        after: auditState({
          version: productionDemoVersion,
          recordCounts: JSON.stringify(productionDemoRecordCounts),
          stockMovements: EXPECTED_MOVEMENTS,
          auditLogs: EXPECTED_AUDIT_LOGS,
        }),
      });

      const branchIds = [...branchByKey.values()].map((branch) => branch.id);
      const categoryIds = [...categoryByKey.values()].map(
        (category) => category.id,
      );
      const supplierIds = supplierByIndex.map((supplier) => supplier.id);
      const customerIds = customerByIndex.map((customer) => customer.id);
      const productIds = productsInOrder.map((product) => product.id);
      const expectedAudits = auditIds.length;
      if (expectedAudits !== EXPECTED_AUDIT_LOGS) {
        throw new Error(
          `Production demo seed built ${expectedAudits} audit entries instead of ${EXPECTED_AUDIT_LOGS}.`,
        );
      }
      await verifyCreatedData(transaction, {
        branchIds,
        categoryIds,
        supplierIds,
        customerIds,
        productIds,
        stockIds,
        purchaseOrderIds,
        goodsReceiptIds,
        quotationIds,
        invoiceIds,
        paymentIds,
        auditIds,
      });

      return {
        status: "created",
        version: productionDemoVersion,
        created: {
          ...productionDemoRecordCounts,
          stockMovements: EXPECTED_MOVEMENTS,
          auditLogs: EXPECTED_AUDIT_LOGS,
          documentSequenceAllocations: 13,
        },
        documentNumbers,
        existingAdminAccountsChanged: 0,
        existingBusinessRecordsChanged: 0,
        deletes: 0,
        overwrites: 0,
      };
    },
    { maxWait: 15_000, timeout: 120_000 },
  );
}

async function verifyApplicationReports() {
  const from = daysAgo(30);
  const to = new Date();
  const [
    dailySales,
    monthlySales,
    valuation,
    topProducts,
    branches,
    outstanding,
    activeAdminAccounts,
  ] = await Promise.all([
    getSalesReport({ from, to, groupBy: "day" }),
    getSalesReport({ from, to, groupBy: "month" }),
    getStockValuationReport({}),
    getTopProductsReport({ from, to, limit: 10 }),
    getBranchComparisonReport({ from, to }),
    getOutstandingPaymentsReport({}),
    prisma.user.count({ where: { role: "ADMIN", isActive: true } }),
  ]);
  const invoiceCount = dailySales.reduce(
    (sum, period) => sum + period.count,
    0,
  );
  const salesTotal = dailySales
    .reduce((sum, period) => sum.plus(period.total), money(0))
    .toFixed(2);
  const stockBranches = valuation.branches.filter(
    (branch) => branch.products.length > 0,
  ).length;
  const branchesWithSales = branches.filter(
    (branch) => Number(branch.salesTotal) > 0,
  ).length;
  if (
    dailySales.length < 5 ||
    monthlySales.length === 0 ||
    invoiceCount < productionDemoRecordCounts.invoices ||
    Number(salesTotal) <= 0 ||
    stockBranches < demoBranches.length ||
    topProducts.length === 0 ||
    branchesWithSales < demoBranches.length ||
    outstanding.length < 4 ||
    activeAdminAccounts < 1
  ) {
    throw new Error(
      "Read-only report verification did not find the expected seeded activity.",
    );
  }
  return {
    dailySalesPeriods: dailySales.length,
    monthlySalesPeriods: monthlySales.length,
    nonCancelledInvoicesInRange: invoiceCount,
    salesTotal,
    stockBranchesWithProducts: stockBranches,
    stockQuantity: valuation.grandTotal.quantity,
    stockValue: valuation.grandTotal.value,
    topProductRows: topProducts.length,
    branchComparisonRows: branches.length,
    branchesWithSales,
    outstandingInvoiceRows: outstanding.length,
    activeAdminAccounts,
  };
}

function safeErrorDetails(error: unknown): {
  name: string;
  code: string | null;
  message: string;
} {
  const candidate =
    error instanceof Error
      ? error
      : new Error("Unknown production demo seed error");
  let message = candidate.message;
  for (const secret of [process.env.DATABASE_URL, process.env.JWT_SECRET]) {
    if (secret) message = message.split(secret).join("[REDACTED]");
  }
  message = message
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[REDACTED DATABASE URL]")
    .replace(
      /\b(password|secret|token)\b(\s*[:=]\s*)[^\s,;]+/gi,
      "$1$2[REDACTED]",
    );
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : null;
  return { name: candidate.name, code, message };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const result = await seedProductionDemo(dryRun);
  const reportVerification =
    dryRun || result.status === "ready"
      ? undefined
      : await verifyApplicationReports();
  console.log(JSON.stringify({ ...result, reportVerification }, null, 2));
}

void main()
  .catch((error: unknown) => {
    console.error(JSON.stringify(safeErrorDetails(error)));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
