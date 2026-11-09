import { Prisma } from "../../generated/prisma/client";
import type { AuthenticatedUser } from "../../middleware/authenticate";
import { withBranchScope } from "../../middleware/branch-scope";
import { prisma } from "../../prisma/client";
import { AppError } from "../../utils/app-error";
import { writeAuditLog } from "../audit/audit.service";
import { refreshLowStockAlert } from "../stock/stock.service";
import type { CreateInvoiceInput, ListInvoicesQuery } from "./invoices.schema";

const invoiceSelect = {
  id: true,
  number: true,
  customerId: true,
  branchId: true,
  quotationId: true,
  createdById: true,
  status: true,
  issuedAt: true,
  dueAt: true,
  notes: true,
  subtotal: true,
  discount: true,
  tax: true,
  total: true,
  createdAt: true,
  updatedAt: true,
  customer: {
    select: { id: true, name: true, email: true, phone: true },
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
      unitPrice: true,
      lineTotal: true,
      product: {
        select: { id: true, sku: true, name: true, unit: true },
      },
    },
  },
} satisfies Prisma.InvoiceSelect;

const invoiceCancellationSelect = {
  ...invoiceSelect,
  items: {
    ...invoiceSelect.items,
    select: {
      ...invoiceSelect.items.select,
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
} satisfies Prisma.InvoiceSelect;

const invoiceQuotationSelect = {
  id: true,
  number: true,
  customerId: true,
  branchId: true,
  status: true,
  notes: true,
  subtotal: true,
  tax: true,
  total: true,
  items: {
    orderBy: { createdAt: "asc" as const },
    select: {
      productId: true,
      quantity: true,
      unitPrice: true,
    },
  },
} satisfies Prisma.QuotationSelect;

type InvoiceRecord = Prisma.InvoiceGetPayload<{
  select: typeof invoiceSelect;
}>;

type InvoiceProduct = {
  id: string;
  name: string;
  reorderLevel: number;
};

type PricedInvoiceItem = {
  productId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  product: InvoiceProduct;
};

type QuotationSource = Prisma.QuotationGetPayload<{
  select: typeof invoiceQuotationSelect;
}>;

type ResolvedInvoice = {
  customerId: string;
  branchId: string;
  quotation: QuotationSource | null;
  dueAt: Date | null;
  notes: string | null;
  discount: Prisma.Decimal;
  tax: Prisma.Decimal;
  items: PricedInvoiceItem[];
};

function auditInvoice(invoice: InvoiceRecord): Prisma.InputJsonObject {
  return {
    id: invoice.id,
    number: invoice.number,
    customerId: invoice.customerId,
    branchId: invoice.branchId,
    quotationId: invoice.quotationId,
    createdById: invoice.createdById,
    status: invoice.status,
    issuedAt: invoice.issuedAt.toISOString(),
    dueAt: invoice.dueAt?.toISOString() ?? null,
    notes: invoice.notes,
    subtotal: invoice.subtotal.toString(),
    discount: invoice.discount.toString(),
    tax: invoice.tax.toString(),
    total: invoice.total.toString(),
    items: invoice.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
      lineTotal: item.lineTotal.toString(),
    })),
  };
}

function assertMoneyPrecision(amount: Prisma.Decimal): void {
  if (amount.comparedTo(new Prisma.Decimal("9999999999.99")) > 0) {
    throw new AppError(
      400,
      "INVOICE_TOTAL_TOO_LARGE",
      "Invoice amounts exceed the supported precision",
    );
  }
}

function calculateSubtotal(items: PricedInvoiceItem[]): Prisma.Decimal {
  const subtotal = items.reduce(
    (total, item) => total.plus(item.unitPrice.mul(item.quantity)),
    new Prisma.Decimal(0),
  );
  assertMoneyPrecision(subtotal);
  return subtotal;
}

async function validateCustomer(
  transaction: Prisma.TransactionClient,
  customerId: string,
): Promise<void> {
  const customer = await transaction.customer.findFirst({
    where: { id: customerId, isActive: true },
    select: { id: true },
  });
  if (!customer) {
    throw new AppError(404, "CUSTOMER_NOT_FOUND", "Active customer not found");
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

async function validateProducts(
  transaction: Prisma.TransactionClient,
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
  }>,
): Promise<PricedInvoiceItem[]> {
  const products = await transaction.product.findMany({
    where: {
      id: { in: items.map((item) => item.productId) },
      isActive: true,
    },
    select: { id: true, name: true, reorderLevel: true },
  });
  const productById = new Map(products.map((product) => [product.id, product]));
  if (productById.size !== items.length) {
    throw new AppError(
      404,
      "PRODUCT_NOT_FOUND",
      "An active product was not found",
    );
  }
  return items.map((item) => {
    const product = productById.get(item.productId);
    if (!product) {
      throw new AppError(
        404,
        "PRODUCT_NOT_FOUND",
        "An active product was not found",
      );
    }
    return { ...item, product };
  });
}

async function nextInvoiceNumber(
  transaction: Prisma.TransactionClient,
): Promise<string> {
  const year = new Date().getFullYear();
  const sequence = await transaction.documentSequence.upsert({
    where: {
      type_year: {
        type: "INVOICE",
        year,
      },
    },
    create: {
      type: "INVOICE",
      year,
      nextValue: 2,
    },
    update: {
      nextValue: { increment: 1 },
    },
    select: { nextValue: true },
  });
  return `INV-${year}-${String(sequence.nextValue - 1).padStart(4, "0")}`;
}

async function resolveInvoiceInput(
  transaction: Prisma.TransactionClient,
  input: CreateInvoiceInput,
  user: AuthenticatedUser,
): Promise<ResolvedInvoice> {
  if ("quotationId" in input) {
    const current = await transaction.quotation.findUnique({
      where: { id: input.quotationId },
      select: { id: true, branchId: true, status: true },
    });
    if (!current) {
      throw new AppError(404, "QUOTATION_NOT_FOUND", "Quotation not found");
    }
    withBranchScope(user, { branchId: current.branchId });
    if (current.status !== "ACCEPTED") {
      throw new AppError(
        409,
        "QUOTATION_NOT_ACCEPTED",
        "Only accepted quotations can be converted into invoices",
      );
    }
    const quotationLock = await transaction.quotation.updateMany({
      where: { id: input.quotationId, status: "ACCEPTED" },
      data: { updatedAt: new Date() },
    });
    if (quotationLock.count !== 1) {
      throw new AppError(
        409,
        "QUOTATION_NOT_ACCEPTED",
        "Quotation status changed before it could be converted",
      );
    }
    const quotation = await transaction.quotation.findUniqueOrThrow({
      where: { id: input.quotationId },
      select: invoiceQuotationSelect,
    });
    withBranchScope(user, { branchId: quotation.branchId });
    if (quotation.status !== "ACCEPTED") {
      throw new AppError(
        409,
        "QUOTATION_NOT_ACCEPTED",
        "Only accepted quotations can be converted into invoices",
      );
    }
    await Promise.all([
      validateCustomer(transaction, quotation.customerId),
      validateBranch(transaction, quotation.branchId),
    ]);
    const items = await validateProducts(
      transaction,
      quotation.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    );
    return {
      customerId: quotation.customerId,
      branchId: quotation.branchId,
      quotation,
      dueAt: input.dueAt ?? null,
      notes: input.notes === undefined ? quotation.notes : input.notes,
      discount: new Prisma.Decimal(0),
      tax: quotation.tax,
      items,
    };
  }

  const { branchId } = withBranchScope(user, { branchId: input.branchId });
  await Promise.all([
    validateCustomer(transaction, input.customerId),
    validateBranch(transaction, branchId),
  ]);
  const items = await validateProducts(
    transaction,
    input.items.map((item) => ({
      ...item,
      unitPrice: new Prisma.Decimal(item.unitPrice),
    })),
  );
  return {
    customerId: input.customerId,
    branchId,
    quotation: null,
    dueAt: input.dueAt ?? null,
    notes: input.notes ?? null,
    discount: new Prisma.Decimal(input.discount),
    tax: new Prisma.Decimal(input.tax),
    items,
  };
}

async function validateAvailableStock(
  transaction: Prisma.TransactionClient,
  branchId: string,
  items: PricedInvoiceItem[],
): Promise<void> {
  const stocks = await transaction.stock.findMany({
    where: {
      branchId,
      productId: { in: items.map((item) => item.productId) },
    },
    select: { productId: true, quantity: true },
  });
  const quantityByProduct = new Map(
    stocks.map((stock) => [stock.productId, stock.quantity]),
  );
  for (const item of items) {
    const available = quantityByProduct.get(item.productId) ?? 0;
    if (available < item.quantity) {
      throw new AppError(
        400,
        "INSUFFICIENT_STOCK",
        `Insufficient stock for product ${item.productId}`,
        { productId: item.productId, requested: item.quantity, available },
      );
    }
  }
}

/** Creates an invoice, deducts branch stock, and records SALE movements atomically. */
export async function createInvoice(
  input: CreateInvoiceInput,
  user: AuthenticatedUser,
  ip: string | undefined,
): Promise<InvoiceRecord> {
  return prisma.$transaction(async (transaction) => {
    const resolved = await resolveInvoiceInput(transaction, input, user);
    const subtotal = calculateSubtotal(resolved.items);
    const discount = resolved.discount;
    const tax = resolved.tax;
    if (discount.comparedTo(subtotal) > 0) {
      throw new AppError(
        400,
        "INVALID_INVOICE_DISCOUNT",
        "Discount cannot exceed the invoice subtotal",
      );
    }
    const total = subtotal.minus(discount).plus(tax);
    assertMoneyPrecision(subtotal);
    assertMoneyPrecision(discount);
    assertMoneyPrecision(tax);
    assertMoneyPrecision(total);
    await validateAvailableStock(
      transaction,
      resolved.branchId,
      resolved.items,
    );

    const invoice = await transaction.invoice.create({
      data: {
        number: await nextInvoiceNumber(transaction),
        customerId: resolved.customerId,
        branchId: resolved.branchId,
        quotationId: resolved.quotation?.id ?? null,
        createdById: user.id,
        status: "PENDING",
        dueAt: resolved.dueAt,
        notes: resolved.notes,
        subtotal,
        discount,
        tax,
        total,
        items: {
          create: resolved.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.unitPrice.mul(item.quantity),
          })),
        },
      },
      select: invoiceSelect,
    });

    for (const item of resolved.items) {
      const decrement = await transaction.stock.updateMany({
        where: {
          productId: item.productId,
          branchId: resolved.branchId,
          quantity: { gte: item.quantity },
        },
        data: { quantity: { decrement: item.quantity } },
      });
      if (decrement.count !== 1) {
        throw new AppError(
          400,
          "INSUFFICIENT_STOCK",
          `Insufficient stock for product ${item.productId}`,
        );
      }
      const stock = await transaction.stock.findUniqueOrThrow({
        where: {
          productId_branchId: {
            productId: item.productId,
            branchId: resolved.branchId,
          },
        },
        select: { quantity: true },
      });
      await transaction.stockMovement.create({
        data: {
          productId: item.productId,
          branchId: resolved.branchId,
          userId: user.id,
          type: "SALE",
          quantity: item.quantity,
          referenceType: "Invoice",
          referenceId: invoice.id,
          notes: resolved.notes ?? `Invoice ${invoice.number}`,
        },
      });
      await refreshLowStockAlert(
        transaction,
        resolved.branchId,
        item.product,
        stock.quantity,
        user.id,
      );
    }

    if (resolved.quotation) {
      const convertedQuotation = await transaction.quotation.update({
        where: { id: resolved.quotation.id },
        data: { status: "CONVERTED" },
        select: { id: true, number: true, status: true },
      });
      await writeAuditLog(
        {
          userId: user.id,
          action: "UPDATE",
          entity: "Quotation",
          entityId: resolved.quotation.id,
          before: {
            id: resolved.quotation.id,
            number: resolved.quotation.number,
            status: resolved.quotation.status,
            invoiceId: null,
          },
          after: {
            id: convertedQuotation.id,
            number: convertedQuotation.number,
            status: convertedQuotation.status,
            invoiceId: invoice.id,
          },
          ip,
        },
        transaction,
      );
    }

    await writeAuditLog(
      {
        userId: user.id,
        action: "CREATE",
        entity: "Invoice",
        entityId: invoice.id,
        after: auditInvoice(invoice),
        ip,
      },
      transaction,
    );
    return invoice;
  });
}

/** Returns branch-scoped invoices with pagination, filters, and sorting. */
export async function listInvoices(
  query: ListInvoicesQuery,
  user: AuthenticatedUser,
): Promise<{ invoices: InvoiceRecord[]; total: number }> {
  const scoped = withBranchScope(user, { branchId: query.branchId });
  const where: Prisma.InvoiceWhereInput = {
    ...(scoped.branchId ? { branchId: scoped.branchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.startDate || query.endDate
      ? {
          issuedAt: {
            ...(query.startDate ? { gte: query.startDate } : {}),
            ...(query.endDate ? { lte: query.endDate } : {}),
          },
        }
      : {}),
  };
  const [invoices, total] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      select: invoiceSelect,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.invoice.count({ where }),
  ]);
  return { invoices, total };
}

/** Retrieves an invoice after applying the caller's branch scope. */
export async function getInvoice(
  id: string,
  user: AuthenticatedUser,
): Promise<InvoiceRecord> {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: invoiceSelect,
  });
  if (!invoice) {
    throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
  }
  withBranchScope(user, { branchId: invoice.branchId });
  return invoice;
}

/** Cancels an unpaid invoice and restores stock with RETURN movements atomically. */
export async function cancelInvoice(
  id: string,
  user: AuthenticatedUser,
  ip: string | undefined,
): Promise<InvoiceRecord> {
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.invoice.findUnique({
      where: { id },
      select: { id: true, branchId: true, status: true },
    });
    if (!current) {
      throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
    }
    withBranchScope(user, { branchId: current.branchId });
    if (current.status === "CANCELLED") {
      throw new AppError(
        409,
        "INVOICE_NOT_CANCELLABLE",
        "The invoice is already cancelled",
      );
    }
    const cancellationLock = await transaction.invoice.updateMany({
      where: {
        id,
        status: { in: ["PENDING", "PARTIAL", "PAID"] },
      },
      data: { updatedAt: new Date() },
    });
    if (cancellationLock.count !== 1) {
      throw new AppError(
        409,
        "INVOICE_NOT_CANCELLABLE",
        "Invoice status changed before it could be cancelled",
      );
    }
    const before = await transaction.invoice.findUniqueOrThrow({
      where: { id },
      select: invoiceCancellationSelect,
    });
    withBranchScope(user, { branchId: before.branchId });
    const paymentCount = await transaction.payment.count({
      where: { invoiceId: id },
    });
    if (paymentCount > 0) {
      throw new AppError(
        409,
        "INVOICE_HAS_PAYMENTS",
        "An invoice with payments cannot be cancelled",
      );
    }
    if (before.status !== "PENDING") {
      throw new AppError(
        409,
        "INVOICE_NOT_CANCELLABLE",
        "Only unpaid pending invoices can be cancelled",
      );
    }

    for (const item of before.items) {
      const stock = await transaction.stock.upsert({
        where: {
          productId_branchId: {
            productId: item.productId,
            branchId: before.branchId,
          },
        },
        create: {
          productId: item.productId,
          branchId: before.branchId,
          quantity: item.quantity,
        },
        update: { quantity: { increment: item.quantity } },
        select: { quantity: true },
      });
      await transaction.stockMovement.create({
        data: {
          productId: item.productId,
          branchId: before.branchId,
          userId: user.id,
          type: "RETURN",
          quantity: item.quantity,
          referenceType: "Invoice",
          referenceId: id,
          notes: `Cancelled invoice ${before.number}`,
        },
      });
      await refreshLowStockAlert(
        transaction,
        before.branchId,
        item.product,
        stock.quantity,
        user.id,
      );
    }

    const after = await transaction.invoice.update({
      where: { id },
      data: { status: "CANCELLED" },
      select: invoiceSelect,
    });
    await writeAuditLog(
      {
        userId: user.id,
        action: "CANCEL",
        entity: "Invoice",
        entityId: id,
        before: auditInvoice(before),
        after: auditInvoice(after),
        ip,
      },
      transaction,
    );
    return after;
  });
}
