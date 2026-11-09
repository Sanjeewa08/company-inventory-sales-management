import { Prisma } from "../../generated/prisma/client";
import type { AuthenticatedUser } from "../../middleware/authenticate";
import { withBranchScope } from "../../middleware/branch-scope";
import { prisma } from "../../prisma/client";
import { AppError } from "../../utils/app-error";
import { writeAuditLog } from "../audit/audit.service";
import type {
  CreateQuotationInput,
  ListQuotationsQuery,
  UpdateQuotationInput,
} from "./quotations.schema";

const quotationSelect = {
  id: true,
  number: true,
  customerId: true,
  branchId: true,
  createdById: true,
  status: true,
  issuedAt: true,
  validUntil: true,
  notes: true,
  subtotal: true,
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
} satisfies Prisma.QuotationSelect;

type QuotationRecord = Prisma.QuotationGetPayload<{
  select: typeof quotationSelect;
}>;

type PricedQuotationItem = {
  productId: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
};

function auditQuotation(quotation: QuotationRecord): Prisma.InputJsonObject {
  return {
    id: quotation.id,
    number: quotation.number,
    customerId: quotation.customerId,
    branchId: quotation.branchId,
    createdById: quotation.createdById,
    status: quotation.status,
    issuedAt: quotation.issuedAt.toISOString(),
    validUntil: quotation.validUntil?.toISOString() ?? null,
    notes: quotation.notes,
    subtotal: quotation.subtotal.toString(),
    tax: quotation.tax.toString(),
    total: quotation.total.toString(),
    items: quotation.items.map((item) => ({
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
      "QUOTATION_TOTAL_TOO_LARGE",
      "Quotation amounts exceed the supported precision",
    );
  }
}

function calculateSubtotal(items: PricedQuotationItem[]): Prisma.Decimal {
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
  items: Array<{ productId: string; quantity: number; unitPrice: string }>,
): Promise<PricedQuotationItem[]> {
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
    unitPrice: new Prisma.Decimal(item.unitPrice),
  }));
}

async function nextQuotationNumber(
  transaction: Prisma.TransactionClient,
): Promise<string> {
  const year = new Date().getFullYear();
  const sequence = await transaction.documentSequence.upsert({
    where: {
      type_year: {
        type: "QUOTATION",
        year,
      },
    },
    create: {
      type: "QUOTATION",
      year,
      nextValue: 2,
    },
    update: {
      nextValue: { increment: 1 },
    },
    select: { nextValue: true },
  });
  return `QT-${year}-${String(sequence.nextValue - 1).padStart(4, "0")}`;
}

function scopeQuotationBranch(user: AuthenticatedUser, branchId: string): void {
  withBranchScope(user, { branchId });
}

/** Returns branch-scoped quotations with pagination, search, and sorting. */
export async function listQuotations(
  query: ListQuotationsQuery,
  user: AuthenticatedUser,
): Promise<{ quotations: QuotationRecord[]; total: number }> {
  const scoped = withBranchScope(user, { branchId: query.branchId });
  const where: Prisma.QuotationWhereInput = {
    ...(scoped.branchId ? { branchId: scoped.branchId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.search
      ? {
          OR: [
            { number: { contains: query.search, mode: "insensitive" } },
            {
              customer: {
                is: {
                  name: { contains: query.search, mode: "insensitive" },
                },
              },
            },
            {
              customer: {
                is: {
                  email: { contains: query.search, mode: "insensitive" },
                },
              },
            },
          ],
        }
      : {}),
  };
  const [quotations, total] = await prisma.$transaction([
    prisma.quotation.findMany({
      where,
      select: quotationSelect,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.quotation.count({ where }),
  ]);
  return { quotations, total };
}

/** Retrieves a quotation after applying the caller's branch scope. */
export async function getQuotation(
  id: string,
  user: AuthenticatedUser,
): Promise<QuotationRecord> {
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    select: quotationSelect,
  });
  if (!quotation) {
    throw new AppError(404, "QUOTATION_NOT_FOUND", "Quotation not found");
  }
  scopeQuotationBranch(user, quotation.branchId);
  return quotation;
}

/** Creates a draft quotation using Decimal totals and a transactional number. */
export async function createQuotation(
  input: CreateQuotationInput,
  user: AuthenticatedUser,
  ip: string | undefined,
): Promise<QuotationRecord> {
  const { branchId } = withBranchScope(user, { branchId: input.branchId });
  return prisma.$transaction(async (transaction) => {
    await Promise.all([
      validateCustomer(transaction, input.customerId),
      validateBranch(transaction, branchId),
    ]);
    const items = await validateProducts(transaction, input.items);
    const subtotal = calculateSubtotal(items);
    const tax = new Prisma.Decimal(input.tax);
    const total = subtotal.plus(tax);
    assertMoneyPrecision(tax);
    assertMoneyPrecision(total);

    const quotation = await transaction.quotation.create({
      data: {
        number: await nextQuotationNumber(transaction),
        customerId: input.customerId,
        branchId,
        createdById: user.id,
        status: "DRAFT",
        validUntil: input.validUntil ?? null,
        notes: input.notes ?? null,
        subtotal,
        tax,
        total,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.unitPrice.mul(item.quantity),
          })),
        },
      },
      select: quotationSelect,
    });
    await writeAuditLog(
      {
        userId: user.id,
        action: "CREATE",
        entity: "Quotation",
        entityId: quotation.id,
        after: auditQuotation(quotation),
        ip,
      },
      transaction,
    );
    return quotation;
  });
}

/** Updates a draft quotation and replaces its items only when supplied. */
export async function updateQuotation(
  id: string,
  input: UpdateQuotationInput,
  user: AuthenticatedUser,
  ip: string | undefined,
): Promise<QuotationRecord> {
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.quotation.findUnique({
      where: { id },
      select: { id: true, branchId: true, status: true },
    });
    if (!current) {
      throw new AppError(404, "QUOTATION_NOT_FOUND", "Quotation not found");
    }
    scopeQuotationBranch(user, current.branchId);
    if (current.status !== "DRAFT") {
      throw new AppError(
        409,
        "QUOTATION_NOT_DRAFT",
        "Only draft quotations can be updated",
      );
    }
    const draftLock = await transaction.quotation.updateMany({
      where: { id, status: "DRAFT" },
      data: { updatedAt: new Date() },
    });
    if (draftLock.count !== 1) {
      throw new AppError(
        409,
        "QUOTATION_NOT_DRAFT",
        "Only draft quotations can be updated",
      );
    }

    const before = await transaction.quotation.findUniqueOrThrow({
      where: { id },
      select: quotationSelect,
    });
    scopeQuotationBranch(user, before.branchId);
    const customerId = input.customerId ?? before.customerId;
    const branchId = input.branchId ?? before.branchId;
    scopeQuotationBranch(user, branchId);
    await Promise.all([
      ...(input.customerId === undefined
        ? []
        : [validateCustomer(transaction, customerId)]),
      ...(input.branchId === undefined
        ? []
        : [validateBranch(transaction, branchId)]),
    ]);
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

    await transaction.quotation.update({
      where: { id },
      data: {
        ...(input.customerId === undefined ? {} : { customerId }),
        ...(input.branchId === undefined ? {} : { branchId }),
        ...(input.validUntil === undefined
          ? {}
          : { validUntil: input.validUntil }),
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
                  unitPrice: item.unitPrice,
                  lineTotal: item.unitPrice.mul(item.quantity),
                })),
              },
            }
          : {}),
      },
    });
    const after = await transaction.quotation.findUniqueOrThrow({
      where: { id },
      select: quotationSelect,
    });
    await writeAuditLog(
      {
        userId: user.id,
        action: "UPDATE",
        entity: "Quotation",
        entityId: id,
        before: auditQuotation(before),
        after: auditQuotation(after),
        ip,
      },
      transaction,
    );
    return after;
  });
}

async function transitionQuotation(
  id: string,
  expectedStatus: "DRAFT" | "SENT",
  status: "SENT" | "ACCEPTED" | "EXPIRED",
  user: AuthenticatedUser,
  ip: string | undefined,
): Promise<QuotationRecord> {
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.quotation.findUnique({
      where: { id },
      select: { id: true, branchId: true, status: true },
    });
    if (!current) {
      throw new AppError(404, "QUOTATION_NOT_FOUND", "Quotation not found");
    }
    scopeQuotationBranch(user, current.branchId);
    if (current.status !== expectedStatus) {
      throw new AppError(
        409,
        "QUOTATION_INVALID_STATUS",
        `Only ${expectedStatus.toLowerCase()} quotations can be changed to ${status.toLowerCase()}`,
      );
    }
    const statusLock = await transaction.quotation.updateMany({
      where: { id, status: expectedStatus },
      data: { updatedAt: new Date() },
    });
    if (statusLock.count !== 1) {
      throw new AppError(
        409,
        "QUOTATION_INVALID_STATUS",
        "Quotation status changed before the operation could complete",
      );
    }
    const before = await transaction.quotation.findUniqueOrThrow({
      where: { id },
      select: quotationSelect,
    });
    scopeQuotationBranch(user, before.branchId);
    if (before.status !== expectedStatus) {
      throw new AppError(
        409,
        "QUOTATION_INVALID_STATUS",
        "Quotation status changed before the operation could complete",
      );
    }
    if (
      status !== "EXPIRED" &&
      before.validUntil &&
      before.validUntil.getTime() <= Date.now()
    ) {
      throw new AppError(
        409,
        "QUOTATION_EXPIRED",
        "An expired quotation cannot be sent or accepted",
      );
    }
    const after = await transaction.quotation.update({
      where: { id },
      data: { status },
      select: quotationSelect,
    });
    await writeAuditLog(
      {
        userId: user.id,
        action: "UPDATE",
        entity: "Quotation",
        entityId: id,
        before: auditQuotation(before),
        after: auditQuotation(after),
        ip,
      },
      transaction,
    );
    return after;
  });
}

/** Sends a draft quotation unless its validity date has passed. */
export async function sendQuotation(
  id: string,
  user: AuthenticatedUser,
  ip: string | undefined,
): Promise<QuotationRecord> {
  return transitionQuotation(id, "DRAFT", "SENT", user, ip);
}

/** Accepts a sent quotation that has not expired. */
export async function acceptQuotation(
  id: string,
  user: AuthenticatedUser,
  ip: string | undefined,
): Promise<QuotationRecord> {
  return transitionQuotation(id, "SENT", "ACCEPTED", user, ip);
}

/** Marks a sent quotation as expired. */
export async function expireQuotation(
  id: string,
  user: AuthenticatedUser,
  ip: string | undefined,
): Promise<QuotationRecord> {
  return transitionQuotation(id, "SENT", "EXPIRED", user, ip);
}

/** Prepares invoice input from an accepted quotation without creating an invoice. */
export async function prepareInvoicePayloadFromQuotation(
  id: string,
  user: AuthenticatedUser,
): Promise<{
  quotationId: string;
  customerId: string;
  branchId: string;
  dueAt: null;
  notes: string | null;
  subtotal: string;
  tax: string;
  total: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: string;
  }>;
}> {
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    select: quotationSelect,
  });
  if (!quotation) {
    throw new AppError(404, "QUOTATION_NOT_FOUND", "Quotation not found");
  }
  scopeQuotationBranch(user, quotation.branchId);
  if (quotation.status !== "ACCEPTED") {
    throw new AppError(
      409,
      "QUOTATION_NOT_ACCEPTED",
      "Only accepted quotations can be prepared for invoicing",
    );
  }
  return {
    quotationId: quotation.id,
    customerId: quotation.customerId,
    branchId: quotation.branchId,
    dueAt: null,
    notes: quotation.notes,
    subtotal: quotation.subtotal.toString(),
    tax: quotation.tax.toString(),
    total: quotation.total.toString(),
    items: quotation.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
    })),
  };
}
