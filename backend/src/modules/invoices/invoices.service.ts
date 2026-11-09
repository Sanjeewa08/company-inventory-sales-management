import PDFDocument from "pdfkit";
import { Prisma } from "../../generated/prisma/client";
import type { AuthenticatedUser } from "../../middleware/authenticate";
import { withBranchScope } from "../../middleware/branch-scope";
import { prisma } from "../../prisma/client";
import { AppError } from "../../utils/app-error";
import { writeAuditLog } from "../audit/audit.service";
import { refreshLowStockAlert } from "../stock/stock.service";
import type {
  CreateInvoiceInput,
  CreatePaymentInput,
  ListInvoicesQuery,
} from "./invoices.schema";

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

const paymentSelect = {
  id: true,
  invoiceId: true,
  receivedById: true,
  amount: true,
  method: true,
  reference: true,
  receivedAt: true,
  notes: true,
  createdAt: true,
} satisfies Prisma.PaymentSelect;

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

type PaymentRecord = Prisma.PaymentGetPayload<{
  select: typeof paymentSelect;
}>;

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

function auditPayment(payment: PaymentRecord): Prisma.InputJsonObject {
  return {
    id: payment.id,
    invoiceId: payment.invoiceId,
    receivedById: payment.receivedById,
    amount: payment.amount.toString(),
    method: payment.method,
    reference: payment.reference,
    receivedAt: payment.receivedAt.toISOString(),
    notes: payment.notes,
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

/** Records a payment and updates invoice status atomically. */
export async function createInvoicePayment(
  invoiceId: string,
  input: CreatePaymentInput,
  user: AuthenticatedUser,
  ip: string | undefined,
): Promise<{
  payment: PaymentRecord;
  invoice: InvoiceRecord;
  paidAmount: string;
  balance: string;
}> {
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, branchId: true, status: true },
    });
    if (!current) {
      throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
    }
    withBranchScope(user, { branchId: current.branchId });
    if (current.status === "CANCELLED") {
      throw new AppError(
        409,
        "INVOICE_CANCELLED",
        "Payments cannot be recorded on a cancelled invoice",
      );
    }
    const paymentLock = await transaction.invoice.updateMany({
      where: {
        id: invoiceId,
        status: { in: ["PENDING", "PARTIAL"] },
      },
      data: { updatedAt: new Date() },
    });
    if (paymentLock.count !== 1) {
      throw new AppError(
        409,
        "INVOICE_NOT_PAYABLE",
        "Only pending or partially paid invoices can receive payments",
      );
    }
    const before = await transaction.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      select: invoiceSelect,
    });
    withBranchScope(user, { branchId: before.branchId });
    if (before.status !== "PENDING" && before.status !== "PARTIAL") {
      throw new AppError(
        409,
        "INVOICE_NOT_PAYABLE",
        "Only pending or partially paid invoices can receive payments",
      );
    }

    const amount = new Prisma.Decimal(input.amount);
    if (amount.comparedTo(0) <= 0) {
      throw new AppError(
        400,
        "INVALID_PAYMENT_AMOUNT",
        "Payment amount must be greater than zero",
      );
    }
    const aggregate = await transaction.payment.aggregate({
      where: { invoiceId },
      _sum: { amount: true },
    });
    const paidBefore = aggregate._sum.amount ?? new Prisma.Decimal(0);
    const paidAfter = paidBefore.plus(amount);
    if (paidAfter.comparedTo(before.total) > 0) {
      throw new AppError(
        400,
        "OVERPAYMENT",
        "Payment amount cannot exceed the invoice balance",
      );
    }
    const status = paidAfter.equals(before.total) ? "PAID" : "PARTIAL";
    const payment = await transaction.payment.create({
      data: {
        invoiceId,
        receivedById: user.id,
        amount,
        method: input.method,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
      },
      select: paymentSelect,
    });
    const after = await transaction.invoice.update({
      where: { id: invoiceId },
      data: { status },
      select: invoiceSelect,
    });

    await writeAuditLog(
      {
        userId: user.id,
        action: "CREATE",
        entity: "Payment",
        entityId: payment.id,
        after: auditPayment(payment),
        ip,
      },
      transaction,
    );
    if (before.status !== after.status) {
      await writeAuditLog(
        {
          userId: user.id,
          action: "UPDATE",
          entity: "Invoice",
          entityId: invoiceId,
          before: auditInvoice(before),
          after: auditInvoice(after),
          ip,
        },
        transaction,
      );
    }
    return {
      payment,
      invoice: after,
      paidAmount: paidAfter.toString(),
      balance: before.total.minus(paidAfter).toString(),
    };
  });
}

/** Lists payments after checking the caller's invoice branch access. */
export async function listInvoicePayments(
  invoiceId: string,
  user: AuthenticatedUser,
): Promise<PaymentRecord[]> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, branchId: true },
  });
  if (!invoice) {
    throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found");
  }
  withBranchScope(user, { branchId: invoice.branchId });
  return prisma.payment.findMany({
    where: { invoiceId },
    select: paymentSelect,
    orderBy: { receivedAt: "asc" },
  });
}

function renderInvoicePdf(
  invoice: InvoiceRecord,
  paidAmount: Prisma.Decimal,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    const margin = 48;
    const tableWidth = document.page.width - margin * 2;
    let cursorY = 250;

    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.once("error", reject);
    document.once("end", () => resolve(Buffer.concat(chunks)));
    document.info.Title = `Invoice ${invoice.number}`;
    document.info.Author = "Company Inventory & Sales Management";

    document
      .fillColor("#17365D")
      .font("Helvetica-Bold")
      .fontSize(20)
      .text("COMPANY INVENTORY & SALES", margin, 48, {
        width: tableWidth - 125,
      });
    document
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#536273")
      .text("INVENTORY MANAGEMENT", margin, 75);
    document
      .font("Helvetica-Bold")
      .fontSize(23)
      .fillColor("#17365D")
      .text("INVOICE", margin, 48, {
        width: tableWidth,
        align: "right",
      });
    document
      .moveTo(margin, 103)
      .lineTo(document.page.width - margin, 103)
      .strokeColor("#CBD5E1")
      .stroke();

    document
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#17365D")
      .text("INVOICE DETAILS", margin, 122);
    document
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#1F2937")
      .text(`Number: ${invoice.number}`, margin, 141)
      .text(
        `Issued: ${invoice.issuedAt.toISOString().slice(0, 10)}`,
        margin,
        157,
      )
      .text(
        `Due: ${invoice.dueAt?.toISOString().slice(0, 10) ?? "Not specified"}`,
        margin,
        173,
      )
      .text(`Branch: ${invoice.branch.name}`, margin, 189);
    document
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#17365D")
      .text("BILL TO", margin + 270, 122);
    document
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#1F2937")
      .text(invoice.customer.name, margin + 270, 141, {
        width: tableWidth - 270,
      });
    document
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#536273")
      .text(invoice.customer.email ?? "", margin + 270, 159, {
        width: tableWidth - 270,
      })
      .text(invoice.customer.phone ?? "", margin + 270, 174, {
        width: tableWidth - 270,
      });
    document
      .roundedRect(document.page.width - margin - 100, 203, 100, 24, 4)
      .fill(invoice.status === "PAID" ? "#DCFCE7" : "#FEF3C7");
    document
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor("#1F2937")
      .text(invoice.status, document.page.width - margin - 100, 210, {
        width: 100,
        align: "center",
      });

    const drawTableHeader = () => {
      document.rect(margin, cursorY, tableWidth, 24).fill("#E8EEF5");
      document.font("Helvetica-Bold").fontSize(9).fillColor("#334155");
      document.text("Item", margin + 8, cursorY + 7, { width: 245 });
      document.text("Qty", margin + 270, cursorY + 7, {
        width: 42,
        align: "right",
      });
      document.text("Unit price", margin + 325, cursorY + 7, {
        width: 75,
        align: "right",
      });
      document.text("Line total", margin + 410, cursorY + 7, {
        width: tableWidth - 418,
        align: "right",
      });
      cursorY += 24;
    };
    drawTableHeader();

    for (const item of invoice.items) {
      if (cursorY + 24 > document.page.height - margin - 150) {
        document.addPage();
        cursorY = margin;
        drawTableHeader();
      }
      document.font("Helvetica").fontSize(9).fillColor("#1F2937");
      document.text(item.product.name, margin + 8, cursorY + 7, {
        width: 245,
        lineBreak: false,
      });
      document.text(String(item.quantity), margin + 270, cursorY + 7, {
        width: 42,
        align: "right",
      });
      document.text(item.unitPrice.toFixed(2), margin + 325, cursorY + 7, {
        width: 75,
        align: "right",
      });
      document.text(item.lineTotal.toFixed(2), margin + 410, cursorY + 7, {
        width: tableWidth - 418,
        align: "right",
      });
      cursorY += 24;
      document
        .moveTo(margin, cursorY)
        .lineTo(document.page.width - margin, cursorY)
        .strokeColor("#E2E8F0")
        .stroke();
    }

    if (cursorY + 150 > document.page.height - margin) {
      document.addPage();
      cursorY = margin;
    } else {
      cursorY += 22;
    }
    const labelX = margin + 300;
    const valueX = margin + 410;
    const valueWidth = tableWidth - 410;
    const paidBalance = invoice.total.minus(paidAmount);
    const totals = [
      ["Subtotal", invoice.subtotal],
      ["Discount", invoice.discount],
      ["Tax", invoice.tax],
      ["Total", invoice.total],
      ["Paid", paidAmount],
      ["Balance", paidBalance],
    ] as const;
    for (const [index, [label, amount]] of totals.entries()) {
      const rowY = cursorY + index * 19;
      if (label === "Total") {
        document
          .moveTo(labelX, rowY - 5)
          .lineTo(document.page.width - margin, rowY - 5)
          .strokeColor("#94A3B8")
          .stroke();
      }
      document
        .font(
          label === "Total" || label === "Balance"
            ? "Helvetica-Bold"
            : "Helvetica",
        )
        .fontSize(10)
        .fillColor("#1F2937")
        .text(label, labelX, rowY, { width: 95 });
      document.text(amount.toFixed(2), valueX, rowY, {
        width: valueWidth,
        align: "right",
      });
    }
    document
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#64748B")
      .text("Thank you for your business.", margin, document.page.height - 55, {
        width: tableWidth,
        align: "center",
      });
    document.end();
  });
}

/** Creates a PDF invoice with paid and outstanding balances. */
export async function getInvoicePdf(
  invoiceId: string,
  user: AuthenticatedUser,
): Promise<{ filename: string; buffer: Buffer }> {
  const invoice = await getInvoice(invoiceId, user);
  const aggregate = await prisma.payment.aggregate({
    where: { invoiceId },
    _sum: { amount: true },
  });
  const paidAmount = aggregate._sum.amount ?? new Prisma.Decimal(0);
  return {
    filename: `${invoice.number}.pdf`,
    buffer: await renderInvoicePdf(invoice, paidAmount),
  };
}
