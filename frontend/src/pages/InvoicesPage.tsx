import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../components/ui/Button";
import { DataTable, type DataTableColumn } from "../components/ui/DataTable";
import { ErrorState } from "../components/ui/ErrorState";
import { Input } from "../components/ui/Input";
import { Loading } from "../components/ui/Loading";
import { Modal } from "../components/ui/Modal";
import { useAuth } from "../features/auth/useAuth";
import { listProducts, type Product } from "../features/catalog/catalogApi";
import { CatalogPagination } from "../features/catalog/CatalogPagination";
import { InvoiceForm } from "../features/sales/InvoiceForm";
import { PaymentForm } from "../features/sales/PaymentForm";
import {
  cancelInvoice,
  createInvoice,
  createInvoicePayment,
  getInvoice,
  getInvoicePdf,
  listCustomers,
  listInvoicePayments,
  listInvoices,
  listQuotations,
  type CreateInvoiceInput,
  type Customer,
  type Invoice,
  type InvoiceListResponse,
  type InvoiceStatus,
  type Payment,
  type Quotation,
  type PaymentInput,
} from "../features/sales/salesApi";
import {
  dateInputToIso,
  formatDate,
  formatMoney,
  formatMoneyCents,
  parseMoneyCents,
} from "../features/sales/salesFormat";
import { listBranches, type BranchOption } from "../features/stock/stockApi";
import { getApiErrorMessage } from "../lib/api";

type InvoicePageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "loaded";
      result: InvoiceListResponse;
      branches: BranchOption[];
      customers: Customer[];
      products: Product[];
      quotations: Quotation[];
    };

type InvoiceDetailsState =
  | { status: "loading"; id: string }
  | { status: "error"; id: string; message: string }
  | { status: "loaded"; invoice: Invoice; payments: Payment[] };

interface InvoiceFilters {
  status: "" | InvoiceStatus;
  customerId: string;
  branchId: string;
  from: string;
  to: string;
  sortBy: "number" | "issuedAt" | "createdAt" | "total";
  sortOrder: "asc" | "desc";
}

const pageSize = 10;
const initialFilters: InvoiceFilters = {
  status: "",
  customerId: "",
  branchId: "",
  from: "",
  to: "",
  sortBy: "issuedAt",
  sortOrder: "desc",
};
const invoiceStatuses: InvoiceStatus[] = [
  "PENDING",
  "PARTIAL",
  "PAID",
  "CANCELLED",
];

function statusLabel(status: InvoiceStatus): string {
  if (status === "PARTIAL") return "Partially paid";
  return status[0] + status.slice(1).toLowerCase();
}

function statusClass(status: InvoiceStatus): string {
  if (status === "PAID") return "bg-emerald-50 text-emerald-700";
  if (status === "CANCELLED") return "bg-slate-100 text-slate-600";
  if (status === "PARTIAL") return "bg-amber-50 text-amber-700";
  return "bg-indigo-50 text-indigo-700";
}

function sumPaymentCents(payments: Payment[]): bigint {
  return payments.reduce(
    (total, payment) => total + parseMoneyCents(payment.amount),
    0n,
  );
}

export function InvoicesPage() {
  const { user } = useAuth();
  const canCreate =
    user?.role === "ADMIN" ||
    user?.role === "MANAGER" ||
    user?.role === "SALES";
  const canPay =
    user?.role === "ACCOUNTANT" ||
    user?.role === "MANAGER" ||
    user?.role === "ADMIN";
  const canView = canCreate || canPay;
  const canCancel =
    user?.role === "ADMIN" ||
    user?.role === "MANAGER" ||
    user?.role === "SALES";
  const [searchParams, setSearchParams] = useSearchParams();
  const quotationIdParam = searchParams.get("quotationId");
  const handledQuotationParam = useRef<string | null>(null);
  const [state, setState] = useState<InvoicePageState>({ status: "loading" });
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [reloadCount, setReloadCount] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [initialQuotationId, setInitialQuotationId] = useState<string | null>(
    null,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsState, setDetailsState] = useState<InvoiceDetailsState | null>(
    null,
  );
  const [paymentMode, setPaymentMode] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
  const [busyInvoiceId, setBusyInvoiceId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    if (!canView) return;
    let active = true;
    const params = {
      page,
      limit: pageSize,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(dateInputToIso(filters.from)
        ? { startDate: dateInputToIso(filters.from)! }
        : {}),
      ...(dateInputToIso(filters.to, true)
        ? { endDate: dateInputToIso(filters.to, true)! }
        : {}),
    };
    const supplementalData = canCreate
      ? Promise.all([
          listCustomers({
            page: 1,
            limit: 100,
            isActive: true,
            sortBy: "name",
            sortOrder: "asc",
          }),
          listProducts({ page: 1, limit: 100, isActive: true }),
          listQuotations({
            page: 1,
            limit: 100,
            status: "ACCEPTED",
            sortBy: "issuedAt",
            sortOrder: "desc",
          }),
        ])
      : Promise.resolve([null, null, null] as const);

    void Promise.all([listInvoices(params), listBranches(), supplementalData])
      .then(([result, branchResult, supplemental]) => {
        if (active) {
          const [customerResult, productResult, quotationResult] = supplemental;
          setState({
            status: "loaded",
            result,
            branches: branchResult.branches,
            customers: customerResult?.customers ?? [],
            products: productResult?.products ?? [],
            quotations: quotationResult?.quotations ?? [],
          });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message: getApiErrorMessage(error, "Unable to load invoices."),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [canCreate, canView, filters, page, reloadCount]);

  useEffect(() => {
    if (
      state.status !== "loaded" ||
      !canCreate ||
      !quotationIdParam ||
      handledQuotationParam.current === quotationIdParam
    ) {
      return;
    }
    handledQuotationParam.current = quotationIdParam;
    setInitialQuotationId(quotationIdParam);
    setFormOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("quotationId");
    setSearchParams(nextParams, { replace: true });
  }, [canCreate, quotationIdParam, searchParams, setSearchParams, state.status]);

  const refresh = () => {
    setMutationError(null);
    setState({ status: "loading" });
    setReloadCount((count) => count + 1);
  };

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ status: "loading" });
    setPage(1);
    setFilters(draftFilters);
  };

  const resetFilters = () => {
    setDraftFilters(initialFilters);
    setFilters(initialFilters);
    setPage(1);
    setState({ status: "loading" });
    setReloadCount((count) => count + 1);
  };

  const openDetails = async (id: string) => {
    setDetailsOpen(true);
    setPaymentMode(false);
    setDetailsState({ status: "loading", id });
    try {
      const [invoice, payments] = await Promise.all([
        getInvoice(id),
        listInvoicePayments(id),
      ]);
      setDetailsState({ status: "loaded", invoice, payments });
    } catch (error) {
      setDetailsState({
        status: "error",
        id,
        message: getApiErrorMessage(error, "Unable to load invoice details."),
      });
    }
  };

  const saveInvoice = async (input: CreateInvoiceInput) => {
    const invoice = await createInvoice(input);
    toast.success(`Invoice ${invoice.number} created.`);
    setFormOpen(false);
    setInitialQuotationId(null);
    setPage(1);
    refresh();
  };

  const savePayment = async (input: PaymentInput) => {
    if (!detailsState || detailsState.status !== "loaded") return;
    const result = await createInvoicePayment(detailsState.invoice.id, input);
    toast.success(
      `Payment recorded. Balance due: ${formatMoney(result.balance)}.`,
    );
    setDetailsOpen(false);
    setPaymentMode(false);
    refresh();
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setBusyInvoiceId(cancelTarget.id);
    setMutationError(null);
    try {
      await cancelInvoice(cancelTarget.id);
      toast.success(`Invoice ${cancelTarget.number} cancelled.`);
      setCancelTarget(null);
      setDetailsOpen(false);
      refresh();
    } catch (error) {
      setMutationError(
        getApiErrorMessage(error, "Unable to cancel this invoice."),
      );
    } finally {
      setBusyInvoiceId(null);
    }
  };

  const downloadPdf = async (invoice: Invoice) => {
    setMutationError(null);
    setBusyInvoiceId(invoice.id);
    try {
      const blob = await getInvoicePdf(invoice.id);
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${invoice.number}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setMutationError(getApiErrorMessage(error, "Unable to download this PDF."));
    } finally {
      setBusyInvoiceId(null);
    }
  };

  if (!canView) {
    return (
      <ErrorState
        message="Your role does not have access to invoices."
        title="Access restricted"
      />
    );
  }
  if (state.status === "loading") return <Loading label="Loading invoices" />;
  if (state.status === "error") {
    return (
      <ErrorState
        message={state.message}
        onRetry={refresh}
        title="Invoices unavailable"
      />
    );
  }

  const filterCustomers =
    state.customers.length > 0
      ? state.customers
      : Array.from(
          new Map(
            state.result.invoices.map((invoice) => [
              invoice.customerId,
              {
                id: invoice.customerId,
                name: invoice.customer.name,
              },
            ]),
          ).values(),
        );
  const filterSelectClass =
    "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

  const columns: DataTableColumn<Invoice>[] = [
    {
      key: "number",
      header: "Invoice",
      cell: (invoice) => (
        <div>
          <p className="font-semibold text-slate-900">{invoice.number}</p>
          <p className="mt-1 text-xs text-slate-500">
            Issued {formatDate(invoice.issuedAt)}
          </p>
        </div>
      ),
    },
    { key: "customer", header: "Customer", cell: (invoice) => invoice.customer.name },
    { key: "branch", header: "Branch", cell: (invoice) => invoice.branch.name },
    {
      key: "due",
      header: "Due date",
      cell: (invoice) => formatDate(invoice.dueAt),
    },
    {
      key: "status",
      header: "Status",
      cell: (invoice) => (
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(invoice.status)}`}>
          {statusLabel(invoice.status)}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total",
      className: "text-right",
      cell: (invoice) => formatMoney(invoice.total),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (invoice) => (
        <Button
          className="px-2.5"
          onClick={() => void openDetails(invoice.id)}
          type="button"
          variant="ghost"
        >
          Details
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
            Sales & finance
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Invoices
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Review invoices, record payments and download invoice PDFs.
          </p>
        </div>
        {canCreate && (
          <Button
            onClick={() => {
              setInitialQuotationId(null);
              setFormOpen(true);
              setMutationError(null);
            }}
            type="button"
          >
            Create invoice
          </Button>
        )}
      </section>

      {mutationError && (
        <p
          className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          role="alert"
        >
          {mutationError}
        </p>
      )}

      <form
        className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4"
        onSubmit={applyFilters}
      >
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="invoice-status">
            Status
          </label>
          <select
            className={filterSelectClass}
            id="invoice-status"
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                status: event.target.value as InvoiceFilters["status"],
              })
            }
            value={draftFilters.status}
          >
            <option value="">All statuses</option>
            {invoiceStatuses.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="invoice-customer-filter">
            Customer
          </label>
          <select
            className={filterSelectClass}
            id="invoice-customer-filter"
            onChange={(event) =>
              setDraftFilters({ ...draftFilters, customerId: event.target.value })
            }
            value={draftFilters.customerId}
          >
            <option value="">All available customers</option>
            {filterCustomers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
          {!canCreate && (
            <p className="text-xs text-slate-500">
              Customer choices are drawn from the current invoice results.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="invoice-branch-filter">
            Branch
          </label>
          <select
            className={filterSelectClass}
            id="invoice-branch-filter"
            onChange={(event) =>
              setDraftFilters({ ...draftFilters, branchId: event.target.value })
            }
            value={draftFilters.branchId}
          >
            <option value="">All permitted branches</option>
            {state.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Issued from"
          onChange={(event) =>
            setDraftFilters({ ...draftFilters, from: event.target.value })
          }
          type="date"
          value={draftFilters.from}
        />
        <Input
          label="Issued to"
          onChange={(event) =>
            setDraftFilters({ ...draftFilters, to: event.target.value })
          }
          type="date"
          value={draftFilters.to}
        />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="invoice-sort">
            Sort by
          </label>
          <select
            className={filterSelectClass}
            id="invoice-sort"
            onChange={(event) => {
              const sortBy =
                event.target.value === "number" ||
                event.target.value === "createdAt" ||
                event.target.value === "total"
                  ? event.target.value
                  : "issuedAt";
              setDraftFilters({ ...draftFilters, sortBy });
            }}
            value={draftFilters.sortBy}
          >
            <option value="issuedAt">Issue date</option>
            <option value="createdAt">Date added</option>
            <option value="number">Invoice number</option>
            <option value="total">Total</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="invoice-sort-order">
            Direction
          </label>
          <select
            className={filterSelectClass}
            id="invoice-sort-order"
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                sortOrder: event.target.value === "asc" ? "asc" : "desc",
              })
            }
            value={draftFilters.sortOrder}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-4">
          <Button type="submit">Apply filters</Button>
          <Button onClick={resetFilters} type="button" variant="secondary">
            Reset
          </Button>
          <p className="ml-auto self-center text-sm text-slate-500">
            {state.result.pagination.total.toLocaleString()} invoices
          </p>
        </div>
      </form>

      <DataTable
        columns={columns}
        emptyMessage="No invoices match these filters."
        rowKey={(invoice) => invoice.id}
        rows={state.result.invoices}
      />
      {state.result.pagination.total > 0 && (
        <CatalogPagination
          onPageChange={setPage}
          pagination={state.result.pagination}
        />
      )}

      <Modal
        onClose={() => {
          setFormOpen(false);
          setInitialQuotationId(null);
        }}
        open={formOpen}
        title="Create invoice"
      >
        <InvoiceForm
          acceptedQuotations={state.quotations}
          branches={state.branches}
          customers={state.customers}
          initialQuotationId={initialQuotationId}
          key={initialQuotationId ?? "new-invoice"}
          onCancel={() => {
            setFormOpen(false);
            setInitialQuotationId(null);
          }}
          onSave={saveInvoice}
          products={state.products}
        />
      </Modal>

      <Modal
        onClose={() => {
          setDetailsOpen(false);
          setPaymentMode(false);
        }}
        open={detailsOpen}
        title={
          paymentMode ? "Record payment" : "Invoice details"
        }
      >
        {detailsState?.status === "loading" ? (
          <Loading label="Loading invoice details" />
        ) : detailsState?.status === "error" ? (
          <ErrorState
            message={detailsState.message}
            onRetry={() => void openDetails(detailsState.id)}
          />
        ) : detailsState?.status === "loaded" && paymentMode ? (
          <PaymentForm
            balance={balanceFor(detailsState.invoice, detailsState.payments)}
            onCancel={() => setPaymentMode(false)}
            onSave={savePayment}
          />
        ) : detailsState?.status === "loaded" ? (
          <InvoiceDetails
            canCancel={canCancel}
            canPay={canPay}
            busy={busyInvoiceId === detailsState.invoice.id}
            invoice={detailsState.invoice}
            onCancelInvoice={() => setCancelTarget(detailsState.invoice)}
            onDownloadPdf={() => void downloadPdf(detailsState.invoice)}
            onRecordPayment={() => setPaymentMode(true)}
            payments={detailsState.payments}
          />
        ) : null}
      </Modal>

      <Modal
        onClose={() => setCancelTarget(null)}
        open={cancelTarget !== null}
        title="Cancel invoice"
      >
        {cancelTarget && (
          <div className="space-y-5">
            <p className="text-sm text-slate-600">
              Cancel <strong className="text-slate-900">{cancelTarget.number}</strong>?
              The backend will restore its stock. Invoices with payments cannot be cancelled.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => setCancelTarget(null)}
                type="button"
                variant="secondary"
              >
                Keep invoice
              </Button>
              <Button
                loading={busyInvoiceId === cancelTarget.id}
                onClick={() => void confirmCancel()}
                type="button"
                variant="danger"
              >
                Cancel invoice
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function balanceFor(invoice: Invoice, payments: Payment[]): string {
  const balance = parseMoneyCents(invoice.total) - sumPaymentCents(payments);
  return formatMoneyCents(balance > 0n ? balance : 0n);
}

function InvoiceDetails({
  canCancel,
  canPay,
  busy,
  invoice,
  onCancelInvoice,
  onDownloadPdf,
  onRecordPayment,
  payments,
}: {
  canCancel: boolean;
  canPay: boolean;
  busy: boolean;
  invoice: Invoice;
  onCancelInvoice: () => void;
  onDownloadPdf: () => void;
  onRecordPayment: () => void;
  payments: Payment[];
}) {
  const paidCents = sumPaymentCents(payments);
  const balance = parseMoneyCents(invoice.total) - paidCents;
  return (
    <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Detail label="Invoice number" value={invoice.number} />
        <Detail label="Status" value={statusLabel(invoice.status)} />
        <Detail label="Customer" value={invoice.customer.name} />
        <Detail label="Branch" value={invoice.branch.name} />
        <Detail label="Issued" value={formatDate(invoice.issuedAt, true)} />
        <Detail label="Due date" value={formatDate(invoice.dueAt)} />
      </dl>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3 text-right">Quantity</th>
              <th className="px-4 py-3 text-right">Unit price</th>
              <th className="px-4 py-3 text-right">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{item.product.name}</p>
                  <p className="text-xs text-slate-500">{item.product.sku}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  {item.quantity.toLocaleString()} {item.product.unit}
                </td>
                <td className="px-4 py-3 text-right">{formatMoney(item.unitPrice)}</td>
                <td className="px-4 py-3 text-right">{formatMoney(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ml-auto max-w-xs space-y-2 border-t border-slate-100 pt-4 text-sm">
        <MoneyRow label="Subtotal" value={invoice.subtotal} />
        <MoneyRow label="Discount" value={invoice.discount} />
        <MoneyRow label="Tax" value={invoice.tax} />
        <MoneyRow label="Total" value={invoice.total} strong />
        <MoneyRow label="Paid" value={formatMoneyCents(paidCents)} />
        <MoneyRow label="Balance due" value={formatMoneyCents(balance > 0n ? balance : 0n)} strong />
      </div>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Payment history</h3>
        {payments.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
            No payments have been recorded.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-4 py-3">{formatDate(payment.receivedAt, true)}</td>
                    <td className="px-4 py-3">{payment.method.replace("_", " ")}</td>
                    <td className="px-4 py-3">{payment.reference || "—"}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(payment.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {invoice.notes && <Detail label="Notes" value={invoice.notes} />}
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        <Button
          disabled={busy}
          onClick={onDownloadPdf}
          type="button"
          variant="secondary"
        >
          Download PDF
        </Button>
        {canPay &&
          (invoice.status === "PENDING" || invoice.status === "PARTIAL") && (
            <Button onClick={onRecordPayment} type="button">
              Record payment
            </Button>
          )}
        {canCancel && invoice.status === "PENDING" && (
          <Button
            onClick={onCancelInvoice}
            type="button"
            variant="danger"
          >
            Cancel invoice
          </Button>
        )}
      </div>
    </div>
  );
}

function MoneyRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${strong ? "font-semibold text-slate-900" : "text-slate-600"}`}
    >
      <span>{label}</span>
      <span>{formatMoney(value)}</span>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}
