import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useState } from "react";
import { DataTable, type DataTableColumn } from "../components/ui/DataTable";
import { ErrorState } from "../components/ui/ErrorState";
import { Loading } from "../components/ui/Loading";
import { useAuth } from "../features/auth/useAuth";
import {
  getDashboardData,
  type DashboardData,
} from "../features/dashboard/dashboardService";
import { getApiErrorMessage } from "../lib/api";

type DashboardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; data: DashboardData };

interface RecentInvoice {
  id: string;
  number: string;
  status: "PENDING" | "PARTIAL" | "PAID";
  issuedAt: string;
  total: string;
  customer: { name: string };
  branch: { name: string };
}

function formatAmount(value: string | number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const invoiceColumns: DataTableColumn<RecentInvoice>[] = [
  {
    key: "invoice",
    header: "Invoice",
    cell: (invoice) => (
      <span className="font-semibold text-slate-900">{invoice.number}</span>
    ),
  },
  { key: "customer", header: "Customer", cell: (invoice) => invoice.customer.name },
  { key: "branch", header: "Branch", cell: (invoice) => invoice.branch.name },
  {
    key: "date",
    header: "Issued",
    cell: (invoice) => formatDate(invoice.issuedAt),
  },
  {
    key: "total",
    header: "Total",
    className: "text-right",
    cell: (invoice) => formatAmount(invoice.total),
  },
  {
    key: "status",
    header: "Status",
    cell: (invoice) => (
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
        {invoice.status}
      </span>
    ),
  },
];

export function DashboardPage() {
  const { user } = useAuth();
  const [state, setState] = useState<DashboardState>({ status: "loading" });
  const [retryCount, setRetryCount] = useState(0);
  const firstName = user?.name.split(/\s+/)[0] ?? "there";

  useEffect(() => {
    if (!user) return;

    let active = true;
    void getDashboardData(user)
      .then((data) => {
        if (active) setState({ status: "loaded", data });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message: getApiErrorMessage(
              error,
              "Dashboard data could not be loaded.",
            ),
          });
        }
      });

    return () => {
      active = false;
    };
  }, [retryCount, user]);

  const retry = () => {
    setState({ status: "loading" });
    setRetryCount((count) => count + 1);
  };

  if (state.status === "loading") {
    return <Loading label="Loading dashboard data" />;
  }
  if (state.status === "error") {
    return (
      <ErrorState
        message={state.message}
        onRetry={retry}
        title="Dashboard unavailable"
      />
    );
  }

  const { data } = state;
  const metricCards = [
    {
      label: "Total products",
      value: data.totalProductCount.toLocaleString(),
      detail: `${data.activeProductCount.toLocaleString()} active`,
      initials: "PR",
    },
    ...(data.lowStockAlertCount === null
      ? []
      : [
          {
            label: "Low-stock alerts",
            value: data.lowStockAlertCount.toLocaleString(),
            detail: user?.role === "ADMIN" ? "Across all branches" : "Your assigned branch",
            initials: "LS",
          },
        ]),
    ...(data.salesTotal !== null
      ? [
          {
            label: "Sales · last 30 days",
            value: formatAmount(data.salesTotal),
            detail: "Non-cancelled invoices",
            initials: "SA",
          },
        ]
      : data.recentInvoiceCount === null
        ? []
        : [
            {
              label: "Invoices · last 30 days",
              value: data.recentInvoiceCount.toLocaleString(),
              detail: "Non-cancelled invoices in your branch",
              initials: "IN",
            },
          ]),
    ...(data.stockValue !== null
      ? [
          {
            label: "Stock value",
            value: formatAmount(data.stockValue),
            detail: `${data.stockQuantity?.toLocaleString() ?? "0"} units · all branches`,
            initials: "SV",
          },
        ]
      : data.branchStockLineCount === null
        ? []
        : [
            {
              label: "Tracked stock lines",
              value: data.branchStockLineCount.toLocaleString(),
              detail: "In your assigned branch",
              initials: "ST",
            },
          ]),
  ];

  const salesChartData =
    data.sales?.map((period) => ({
      period: formatDate(period.period),
      total: Number(period.total),
    })) ?? [];

  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700">
            <span className="size-1.5 rounded-full bg-indigo-500" />
            {user?.role} workspace
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Good to see you, {firstName}
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            A live view of the business data available to your role.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-500 shadow-sm">
          Updated just now
        </div>
      </section>

      <section
        aria-label="Key performance indicators"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {metricCards.map((card, index) => (
          <article
            className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40"
            key={card.label}
          >
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <span
                className={`grid size-9 place-items-center rounded-xl text-[10px] font-bold ${
                  index % 2 === 0
                    ? "bg-indigo-50 text-indigo-700"
                    : "bg-cyan-50 text-cyan-700"
                }`}
              >
                {card.initials}
              </span>
            </div>
            <p className="mt-5 text-3xl font-bold tracking-tight text-slate-900">
              {card.value}
            </p>
            <p className="mt-1.5 text-xs text-slate-400">{card.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        {data.sales !== null && (
          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">Sales overview</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Non-cancelled invoices · last 30 days
                </p>
              </div>
              <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-500">
                Last 30 days
              </span>
            </div>
            {salesChartData.length === 0 ? (
              <p className="py-16 text-center text-sm text-slate-500">
                No sales during the last 30 days.
              </p>
            ) : (
              <div aria-label="Sales over the last 30 days" className="mt-6 h-64">
                <ResponsiveContainer height="100%" width="100%">
                  <AreaChart
                    data={salesChartData}
                    margin={{ top: 6, right: 4, left: -18, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.24} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="#edf0f6"
                      strokeDasharray="4 5"
                      vertical={false}
                    />
                    <XAxis
                      axisLine={false}
                      dataKey="period"
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      tickLine={false}
                    />
                    <YAxis
                      axisLine={false}
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      tickFormatter={(value: number) => formatAmount(value)}
                      tickLine={false}
                      width={64}
                    />
                    <Tooltip
                      contentStyle={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        boxShadow: "0 8px 24px rgba(15, 23, 42, .08)",
                      }}
                      formatter={(value) => [
                        formatAmount(String(value ?? 0)),
                        "Sales",
                      ]}
                    />
                    <Area
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      dataKey="total"
                      fill="url(#salesFill)"
                      isAnimationActive={false}
                      stroke="#5b63df"
                      strokeWidth={2.5}
                      type="monotone"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </article>
        )}

        {data.lowStockAlerts !== null && (
          <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">Low-stock alerts</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Active alerts visible to your role
                </p>
              </div>
              <span className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700">
                {data.lowStockAlertCount?.toLocaleString() ?? 0}
              </span>
            </div>
            {data.lowStockAlerts.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-500">
                No active low-stock alerts.
              </p>
            ) : (
              <ul className="mt-5 divide-y divide-slate-100">
                {data.lowStockAlerts.map((alert) => (
                  <li className="py-3 first:pt-0 last:pb-0" key={alert.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          {alert.product.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {alert.product.sku} · {alert.branch.name}
                        </p>
                      </div>
                      <time
                        className="shrink-0 text-xs text-slate-400"
                        dateTime={alert.createdAt}
                      >
                        {formatDate(alert.createdAt)}
                      </time>
                    </div>
                    <p className="mt-2 text-xs text-amber-700">{alert.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </article>
        )}
      </section>

      {data.recentInvoices !== null && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">Recent sales</h3>
              <p className="mt-1 text-xs text-slate-500">
                Latest non-cancelled invoices in the last 30 days
              </p>
            </div>
          </div>
          <DataTable
            columns={invoiceColumns}
            emptyMessage="No sales in the last 30 days."
            rowKey={(invoice) => invoice.id}
            rows={data.recentInvoices}
          />
        </section>
      )}
    </div>
  );
}
