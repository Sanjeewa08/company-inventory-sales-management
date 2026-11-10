import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../prisma/client";
import type {
  BranchComparisonQuery,
  OutstandingPaymentsQuery,
  SalesReportQuery,
  StockValuationQuery,
  TopProductsQuery,
} from "./reports.schema";

type DecimalValue = Prisma.Decimal | string | number | bigint | null;

function decimalString(value: DecimalValue): string {
  return new Prisma.Decimal(value?.toString() ?? "0").toFixed(2);
}

function quantityNumber(value: number | bigint | null): number {
  return Number(value ?? 0);
}

type SalesRow = {
  period: Date;
  invoiceCount: number | bigint;
  subtotal: DecimalValue;
  discount: DecimalValue;
  tax: DecimalValue;
  total: DecimalValue;
};

/** Returns non-cancelled invoice totals grouped by the requested period. */
export async function getSalesReport(query: SalesReportQuery): Promise<
  Array<{
    period: string;
    count: number;
    subtotal: string;
    discount: string;
    tax: string;
    total: string;
  }>
> {
  const branchFilter = query.branchId
    ? Prisma.sql`AND i."branchId" = ${query.branchId}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<SalesRow[]>(Prisma.sql`
    WITH invoice_periods AS (
      SELECT
        date_trunc(${query.groupBy}, i."issuedAt") AS period,
        i.subtotal,
        i.discount,
        i.tax,
        i.total
      FROM "Invoice" AS i
      WHERE i.status <> 'CANCELLED'
        AND i."issuedAt" >= ${query.from}
        AND i."issuedAt" <= ${query.to}
        ${branchFilter}
    )
    SELECT
      COUNT(*)::bigint AS "invoiceCount",
      period,
      COALESCE(SUM(subtotal), 0)::numeric AS subtotal,
      COALESCE(SUM(discount), 0)::numeric AS discount,
      COALESCE(SUM(tax), 0)::numeric AS tax,
      COALESCE(SUM(total), 0)::numeric AS total
    FROM invoice_periods
    GROUP BY period
    ORDER BY period ASC
  `);
  return rows.map((row) => ({
    period: row.period.toISOString(),
    count: quantityNumber(row.invoiceCount),
    subtotal: decimalString(row.subtotal),
    discount: decimalString(row.discount),
    tax: decimalString(row.tax),
    total: decimalString(row.total),
  }));
}

type StockValuationRow = {
  branchId: string;
  branchName: string;
  productId: string | null;
  sku: string | null;
  productName: string | null;
  quantity: number | null;
  costPrice: DecimalValue;
};

type StockBranchAccumulator = {
  branchId: string;
  branchName: string;
  products: Array<{
    productId: string;
    sku: string;
    name: string;
    quantity: number;
    costPrice: string;
    stockValue: string;
  }>;
  quantity: number;
  value: Prisma.Decimal;
};

/** Computes product, branch, and grand stock valuations with Decimal arithmetic. */
export async function getStockValuationReport(
  query: StockValuationQuery,
): Promise<{
  branches: Array<{
    branchId: string;
    branchName: string;
    products: StockBranchAccumulator["products"];
    totalQuantity: number;
    totalValue: string;
  }>;
  grandTotal: { quantity: number; value: string };
}> {
  const branchFilter = query.branchId
    ? Prisma.sql`WHERE b.id = ${query.branchId}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<StockValuationRow[]>(Prisma.sql`
    SELECT
      b.id AS "branchId",
      b.name AS "branchName",
      p.id AS "productId",
      p.sku,
      p.name AS "productName",
      s.quantity,
      p."costPrice"
    FROM "Branch" AS b
    LEFT JOIN "Stock" AS s ON s."branchId" = b.id
    LEFT JOIN "Product" AS p ON p.id = s."productId"
    ${branchFilter}
    ORDER BY b.name ASC, p.name ASC
  `);

  const branches = new Map<string, StockBranchAccumulator>();
  let grandQuantity = 0;
  let grandValue = new Prisma.Decimal(0);
  for (const row of rows) {
    let branch = branches.get(row.branchId);
    if (!branch) {
      branch = {
        branchId: row.branchId,
        branchName: row.branchName,
        products: [],
        quantity: 0,
        value: new Prisma.Decimal(0),
      };
      branches.set(row.branchId, branch);
    }
    if (
      row.productId === null ||
      row.sku === null ||
      row.productName === null ||
      row.quantity === null
    ) {
      continue;
    }
    const quantity = quantityNumber(row.quantity);
    const costPrice = new Prisma.Decimal(row.costPrice?.toString() ?? "0");
    const stockValue = costPrice.mul(quantity);
    branch.products.push({
      productId: row.productId,
      sku: row.sku,
      name: row.productName,
      quantity,
      costPrice: costPrice.toFixed(2),
      stockValue: stockValue.toFixed(2),
    });
    branch.quantity += quantity;
    branch.value = branch.value.plus(stockValue);
    grandQuantity += quantity;
    grandValue = grandValue.plus(stockValue);
  }
  return {
    branches: [...branches.values()].map((branch) => ({
      branchId: branch.branchId,
      branchName: branch.branchName,
      products: branch.products,
      totalQuantity: branch.quantity,
      totalValue: branch.value.toFixed(2),
    })),
    grandTotal: {
      quantity: grandQuantity,
      value: grandValue.toFixed(2),
    },
  };
}

type TopProductRow = {
  productId: string;
  sku: string;
  name: string;
  quantity: number | bigint;
  revenue: DecimalValue;
};

/** Returns best-selling products, ordered by units sold then revenue. */
export async function getTopProductsReport(query: TopProductsQuery): Promise<
  Array<{
    productId: string;
    sku: string;
    name: string;
    quantity: number;
    revenue: string;
  }>
> {
  const branchFilter = query.branchId
    ? Prisma.sql`AND i."branchId" = ${query.branchId}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<TopProductRow[]>(Prisma.sql`
    SELECT
      p.id AS "productId",
      p.sku,
      p.name,
      SUM(ii.quantity)::bigint AS quantity,
      COALESCE(SUM(ii."lineTotal"), 0)::numeric AS revenue
    FROM "InvoiceItem" AS ii
    INNER JOIN "Invoice" AS i ON i.id = ii."invoiceId"
    INNER JOIN "Product" AS p ON p.id = ii."productId"
    WHERE i.status <> 'CANCELLED'
      AND i."issuedAt" >= ${query.from}
      AND i."issuedAt" <= ${query.to}
      ${branchFilter}
    GROUP BY p.id, p.sku, p.name
    ORDER BY quantity DESC, revenue DESC, p.name ASC
    LIMIT ${query.limit}
  `);
  return rows.map((row) => ({
    productId: row.productId,
    sku: row.sku,
    name: row.name,
    quantity: quantityNumber(row.quantity),
    revenue: decimalString(row.revenue),
  }));
}

type BranchComparisonRow = {
  branchId: string;
  branchName: string;
  invoiceCount: number | bigint;
  salesTotal: DecimalValue;
  stockValue: DecimalValue;
};

/** Compares sales and current stock valuation across every branch. */
export async function getBranchComparisonReport(
  query: BranchComparisonQuery,
): Promise<
  Array<{
    branchId: string;
    branchName: string;
    salesTotal: string;
    invoiceCount: number;
    stockValue: string;
  }>
> {
  const rows = await prisma.$queryRaw<BranchComparisonRow[]>(Prisma.sql`
    WITH branch_sales AS (
      SELECT
        i."branchId",
        COUNT(*)::bigint AS "invoiceCount",
        COALESCE(SUM(i.total), 0)::numeric AS "salesTotal"
      FROM "Invoice" AS i
      WHERE i.status <> 'CANCELLED'
        AND i."issuedAt" >= ${query.from}
        AND i."issuedAt" <= ${query.to}
      GROUP BY i."branchId"
    ),
    branch_stock AS (
      SELECT
        s."branchId",
        COALESCE(SUM(s.quantity::numeric * p."costPrice"), 0)::numeric AS "stockValue"
      FROM "Stock" AS s
      INNER JOIN "Product" AS p ON p.id = s."productId"
      GROUP BY s."branchId"
    )
    SELECT
      b.id AS "branchId",
      b.name AS "branchName",
      COALESCE(bs."invoiceCount", 0)::bigint AS "invoiceCount",
      COALESCE(bs."salesTotal", 0)::numeric AS "salesTotal",
      COALESCE(bt."stockValue", 0)::numeric AS "stockValue"
    FROM "Branch" AS b
    LEFT JOIN branch_sales AS bs ON bs."branchId" = b.id
    LEFT JOIN branch_stock AS bt ON bt."branchId" = b.id
    ORDER BY b.name ASC
  `);
  return rows.map((row) => ({
    branchId: row.branchId,
    branchName: row.branchName,
    salesTotal: decimalString(row.salesTotal),
    invoiceCount: quantityNumber(row.invoiceCount),
    stockValue: decimalString(row.stockValue),
  }));
}

type OutstandingPaymentRow = {
  invoiceId: string;
  invoiceNumber: string;
  status: "PENDING" | "PARTIAL";
  issuedAt: Date;
  dueAt: Date | null;
  customerId: string;
  customerName: string;
  branchId: string;
  branchName: string;
  total: DecimalValue;
  paidAmount: DecimalValue;
  balanceDue: DecimalValue;
  ageDays: number;
};

/** Lists unpaid and partially paid invoices with Decimal-safe balances. */
export async function getOutstandingPaymentsReport(
  query: OutstandingPaymentsQuery,
): Promise<
  Array<{
    invoiceId: string;
    invoiceNumber: string;
    status: "PENDING" | "PARTIAL";
    issuedAt: string;
    dueAt: string | null;
    customerId: string;
    customerName: string;
    branchId: string;
    branchName: string;
    total: string;
    paidAmount: string;
    balanceDue: string;
    ageDays: number;
  }>
> {
  const branchFilter = query.branchId
    ? Prisma.sql`AND i."branchId" = ${query.branchId}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<OutstandingPaymentRow[]>(Prisma.sql`
    WITH payment_totals AS (
      SELECT "invoiceId", COALESCE(SUM(amount), 0)::numeric AS amount
      FROM "Payment"
      GROUP BY "invoiceId"
    )
    SELECT
      i.id AS "invoiceId",
      i.number AS "invoiceNumber",
      i.status,
      i."issuedAt",
      i."dueAt",
      c.id AS "customerId",
      c.name AS "customerName",
      b.id AS "branchId",
      b.name AS "branchName",
      i.total,
      COALESCE(pt.amount, 0)::numeric AS "paidAmount",
      (i.total - COALESCE(pt.amount, 0))::numeric AS "balanceDue",
      GREATEST(CURRENT_DATE - i."issuedAt"::date, 0)::int AS "ageDays"
    FROM "Invoice" AS i
    INNER JOIN "Customer" AS c ON c.id = i."customerId"
    INNER JOIN "Branch" AS b ON b.id = i."branchId"
    LEFT JOIN payment_totals AS pt ON pt."invoiceId" = i.id
    WHERE i.status IN ('PENDING', 'PARTIAL')
      ${branchFilter}
    ORDER BY i."issuedAt" ASC, i.number ASC
  `);
  return rows.map((row) => ({
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    issuedAt: row.issuedAt.toISOString(),
    dueAt: row.dueAt?.toISOString() ?? null,
    customerId: row.customerId,
    customerName: row.customerName,
    branchId: row.branchId,
    branchName: row.branchName,
    total: decimalString(row.total),
    paidAmount: decimalString(row.paidAmount),
    balanceDue: decimalString(row.balanceDue),
    ageDays: row.ageDays,
  }));
}
