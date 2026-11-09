import { apiClient } from "../../lib/api";
import type { AuthenticatedUser } from "../../types/auth";

interface Pagination {
  total: number;
}

interface ProductListResponse {
  products: Array<{ id: string }>;
  pagination: Pagination;
}

interface LowStockAlert {
  id: string;
  message: string;
  createdAt: string;
  product: { name: string; sku: string };
  branch: { name: string };
}

interface LowStockResponse {
  alerts: LowStockAlert[];
  pagination: Pagination;
}

interface SalesPeriod {
  period: string;
  count: number;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
}

interface SalesReportResponse {
  sales: SalesPeriod[];
}

interface StockValuationResponse {
  stockValuation: {
    grandTotal: { quantity: number; value: string };
  };
}

type InvoiceStatus = "PENDING" | "PARTIAL" | "PAID";

interface DashboardInvoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  issuedAt: string;
  total: string;
  customer: { name: string };
  branch: { name: string };
}

interface InvoiceListResponse {
  invoices: DashboardInvoice[];
  pagination: Pagination;
}

interface StockListResponse {
  stock: Array<{ id: string }>;
  pagination: Pagination;
}

export interface DashboardData {
  totalProductCount: number;
  activeProductCount: number;
  lowStockAlertCount: number | null;
  lowStockAlerts: LowStockAlert[] | null;
  sales: SalesPeriod[] | null;
  salesTotal: string | null;
  stockValue: string | null;
  stockQuantity: number | null;
  branchStockLineCount: number | null;
  recentInvoices: DashboardInvoice[] | null;
  recentInvoiceCount: number | null;
}

const invoiceStatuses: InvoiceStatus[] = ["PENDING", "PARTIAL", "PAID"];
const dashboardPeriodDays = 30;

function canViewReports(user: AuthenticatedUser): boolean {
  return ["ADMIN", "MANAGER", "ACCOUNTANT"].includes(user.role);
}

function canViewInvoices(user: AuthenticatedUser): boolean {
  return (
    user.role !== "STOREKEEPER" &&
    (user.role === "ADMIN" || user.role === "MANAGER" || user.branchId !== null)
  );
}

function canViewBranchScopedData(user: AuthenticatedUser): boolean {
  return user.role === "ADMIN" || user.branchId !== null;
}

function sumMoneyAmounts(amounts: string[]): string {
  const totalCents = amounts.reduce((total, amount) => {
    const [whole, fraction = ""] = amount.split(".");
    return (
      total +
      BigInt(whole) * 100n +
      BigInt(fraction.padEnd(2, "0").slice(0, 2))
    );
  }, 0n);
  const whole = totalCents / 100n;
  const fraction = (totalCents % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

async function getRecentInvoiceData(
  from: string,
  to: string,
): Promise<{ invoices: DashboardInvoice[]; count: number }> {
  const responses = await Promise.all(
    invoiceStatuses.map((status) =>
      apiClient.get<InvoiceListResponse>("/invoices", {
        params: {
          page: 1,
          limit: 5,
          status,
          startDate: from,
          endDate: to,
          sortBy: "issuedAt",
          sortOrder: "desc",
        },
      }),
    ),
  );
  const invoices = responses
    .flatMap(({ data }) => data.invoices)
    .sort(
      (left, right) =>
        new Date(right.issuedAt).getTime() -
        new Date(left.issuedAt).getTime(),
    )
    .slice(0, 5);

  return {
    invoices,
    count: responses.reduce((count, response) => {
      return count + response.data.pagination.total;
    }, 0),
  };
}

/** Loads dashboard data only from endpoints allowed for the signed-in role. */
export async function getDashboardData(
  user: AuthenticatedUser,
  now = new Date(),
): Promise<DashboardData> {
  const to = now.toISOString();
  const from = new Date(
    now.getTime() - dashboardPeriodDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const reportsAllowed = canViewReports(user);
  const invoicesAllowed = canViewInvoices(user);
  const alertsAllowed = canViewBranchScopedData(user);
  const stockLinesAllowed =
    user.role === "STOREKEEPER" && user.branchId !== null;

  const [
    activeProductsResponse,
    inactiveProductsResponse,
    alertsResponse,
    salesResponse,
    valuationResponse,
    invoiceData,
    stockResponse,
  ] = await Promise.all([
    apiClient.get<ProductListResponse>("/products", {
      params: { page: 1, limit: 1, isActive: true },
    }),
    apiClient.get<ProductListResponse>("/products", {
      params: { page: 1, limit: 1, isActive: false },
    }),
    alertsAllowed
      ? apiClient.get<LowStockResponse>("/alerts/low-stock", {
          params: { page: 1, limit: 5, sortBy: "createdAt", sortOrder: "desc" },
        })
      : Promise.resolve(null),
    reportsAllowed
      ? apiClient.get<SalesReportResponse>("/reports/sales", {
          params: { from, to, groupBy: "day" },
        })
      : Promise.resolve(null),
    reportsAllowed
      ? apiClient.get<StockValuationResponse>("/reports/stock-valuation")
      : Promise.resolve(null),
    invoicesAllowed ? getRecentInvoiceData(from, to) : Promise.resolve(null),
    stockLinesAllowed
      ? apiClient.get<StockListResponse>("/stock", {
          params: { page: 1, limit: 1 },
        })
      : Promise.resolve(null),
  ]);

  const sales = salesResponse?.data.sales ?? null;
  const recentInvoices = invoiceData?.invoices ?? null;

  return {
    totalProductCount:
      activeProductsResponse.data.pagination.total +
      inactiveProductsResponse.data.pagination.total,
    activeProductCount: activeProductsResponse.data.pagination.total,
    lowStockAlertCount: alertsResponse?.data.pagination.total ?? null,
    lowStockAlerts: alertsResponse?.data.alerts ?? null,
    sales,
    salesTotal: sales
      ? sumMoneyAmounts(sales.map((period) => period.total))
      : null,
    stockValue:
      valuationResponse?.data.stockValuation.grandTotal.value ?? null,
    stockQuantity:
      valuationResponse?.data.stockValuation.grandTotal.quantity ?? null,
    branchStockLineCount: stockResponse?.data.pagination.total ?? null,
    recentInvoices,
    recentInvoiceCount: invoiceData?.count ?? null,
  };
}
