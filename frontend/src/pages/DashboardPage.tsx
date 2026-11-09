import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../features/auth/useAuth";

const salesPreview = [
  { day: "Mon", amount: 28 },
  { day: "Tue", amount: 36 },
  { day: "Wed", amount: 31 },
  { day: "Thu", amount: 48 },
  { day: "Fri", amount: 43 },
  { day: "Sat", amount: 57 },
  { day: "Sun", amount: 51 },
];

const kpis = [
  { label: "Net sales", value: "—", meta: "Connected in a later increment", initials: "$$" },
  { label: "Inventory items", value: "—", meta: "Across your permitted branches", initials: "IT" },
  { label: "Open orders", value: "—", meta: "Purchase orders in progress", initials: "PO" },
  { label: "Low-stock alerts", value: "—", meta: "Needs your attention", initials: "AL" },
];

export function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.name.split(/\s+/)[0] ?? "there";

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
            Here’s a starting point for your day across the business.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-500 shadow-sm">
          Dashboard preview · data integration pending
        </div>
      </section>

      <section
        aria-label="Key performance indicators"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {kpis.map((kpi, index) => (
          <article
            className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40"
            key={kpi.label}
          >
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
              <span
                className={`grid size-9 place-items-center rounded-xl text-[10px] font-bold ${
                  index % 2 === 0
                    ? "bg-indigo-50 text-indigo-700"
                    : "bg-cyan-50 text-cyan-700"
                }`}
              >
                {kpi.initials}
              </span>
            </div>
            <p className="mt-5 text-3xl font-bold tracking-tight text-slate-900">
              {kpi.value}
            </p>
            <p className="mt-1.5 text-xs text-slate-400">{kpi.meta}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">Sales overview</h3>
              <p className="mt-1 text-xs text-slate-500">
                Illustrative preview · not live business data
              </p>
            </div>
            <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-500">
              Last 7 days
            </span>
          </div>
          <div aria-label="Illustrative sales trend chart" className="mt-6 h-64">
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart
                data={salesPreview}
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
                  dataKey="day"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(value: number) => `$${value}k`}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    boxShadow: "0 8px 24px rgba(15, 23, 42, .08)",
                  }}
                  formatter={(value) => [`$${value}k`, "Preview sales"]}
                />
                <Area
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  dataKey="amount"
                  fill="url(#salesFill)"
                  isAnimationActive={false}
                  stroke="#5b63df"
                  strokeWidth={2.5}
                  type="monotone"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="flex min-h-[330px] flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
          <div>
            <h3 className="font-semibold text-slate-900">Getting started</h3>
            <p className="mt-1 text-xs text-slate-500">
              Your role-based workspace is ready.
            </p>
          </div>
          <div className="mt-6 flex-1 space-y-3">
            {[
              ["01", "Your access is protected by role permissions"],
              ["02", "Branch access follows your assigned role"],
              ["03", "Business pages will arrive in later increments"],
            ].map(([number, text]) => (
              <div
                className="flex items-start gap-3 rounded-xl bg-slate-50 p-3.5"
                key={number}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white text-[10px] font-bold text-indigo-600 shadow-sm">
                  {number}
                </span>
                <p className="pt-1 text-sm leading-5 text-slate-600">{text}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
            <p className="text-xs font-semibold text-indigo-900">
              Ready for your next step
            </p>
            <p className="mt-1 text-xs leading-5 text-indigo-700/80">
              Use the navigation to explore the sections available to your role.
              Pages are placeholders in this foundation release.
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}
