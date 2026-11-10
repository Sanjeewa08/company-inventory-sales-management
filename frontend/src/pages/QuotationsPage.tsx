import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
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
import { QuotationForm } from "../features/sales/QuotationForm";
import {
  acceptQuotation,
  createQuotation,
  expireQuotation,
  getQuotation,
  listCustomers,
  listQuotations,
  sendQuotation,
  updateQuotation,
  type Customer,
  type Quotation,
  type QuotationInput,
  type QuotationListResponse,
  type QuotationStatus,
  type QuotationUpdate,
} from "../features/sales/salesApi";
import { formatDate, formatMoney } from "../features/sales/salesFormat";
import { listBranches, type BranchOption } from "../features/stock/stockApi";
import { getApiErrorMessage } from "../lib/api";

type QuotationPageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "loaded";
      result: QuotationListResponse;
      customers: Customer[];
      branches: BranchOption[];
      products: Product[];
    };

type QuotationDetailsState =
  | { status: "loading"; id: string }
  | { status: "error"; id: string; message: string }
  | { status: "loaded"; quotation: Quotation };

interface QuotationFilters {
  search: string;
  status: "" | QuotationStatus;
  customerId: string;
  branchId: string;
  sortBy: "number" | "issuedAt" | "createdAt" | "total";
  sortOrder: "asc" | "desc";
}

const pageSize = 10;
const initialFilters: QuotationFilters = {
  search: "",
  status: "",
  customerId: "",
  branchId: "",
  sortBy: "issuedAt",
  sortOrder: "desc",
};
const quotationStatuses: QuotationStatus[] = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "CONVERTED",
  "EXPIRED",
  "REJECTED",
];

function statusLabel(status: QuotationStatus): string {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function statusClass(status: QuotationStatus): string {
  if (status === "ACCEPTED" || status === "CONVERTED") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "EXPIRED" || status === "REJECTED") {
    return "bg-slate-100 text-slate-600";
  }
  if (status === "SENT") return "bg-indigo-50 text-indigo-700";
  return "bg-amber-50 text-amber-700";
}

export function QuotationsPage() {
  const { user } = useAuth();
  const canManage =
    user?.role === "ADMIN" ||
    user?.role === "MANAGER" ||
    user?.role === "SALES";
  const navigate = useNavigate();
  const [state, setState] = useState<QuotationPageState>({
    status: "loading",
  });
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [reloadCount, setReloadCount] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsState, setDetailsState] = useState<QuotationDetailsState | null>(
    null,
  );
  const [busyQuotationId, setBusyQuotationId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    const params = {
      page,
      limit: pageSize,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
    };
    void Promise.all([
      listQuotations(params),
      listCustomers({
        page: 1,
        limit: 100,
        isActive: true,
        sortBy: "name",
        sortOrder: "asc",
      }),
      listBranches(),
      listProducts({ page: 1, limit: 100, isActive: true }),
    ])
      .then(([result, customerResult, branchResult, productResult]) => {
        if (active) {
          setState({
            status: "loaded",
            result,
            customers: customerResult.customers,
            branches: branchResult.branches,
            products: productResult.products,
          });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message: getApiErrorMessage(error, "Unable to load quotations."),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [canManage, filters, page, reloadCount]);

  const refresh = () => {
    setMutationError(null);
    setState({ status: "loading" });
    setReloadCount((count) => count + 1);
  };

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ status: "loading" });
    setPage(1);
    setFilters({ ...draftFilters, search: draftFilters.search.trim() });
  };

  const resetFilters = () => {
    setDraftFilters(initialFilters);
    setFilters(initialFilters);
    setPage(1);
    setState({ status: "loading" });
    setReloadCount((count) => count + 1);
  };

  const saveNewQuotation = async (input: QuotationInput) => {
    const quotation = await createQuotation(input);
    toast.success(`Draft ${quotation.number} created.`);
    setFormOpen(false);
    setPage(1);
    refresh();
  };

  const saveQuotationChanges = async (
    id: string,
    input: QuotationUpdate,
  ) => {
    const quotation = await updateQuotation(id, input);
    toast.success(`Draft ${quotation.number} updated.`);
    setFormOpen(false);
    refresh();
  };

  const openDetails = (id: string) => {
    setDetailsOpen(true);
    setDetailsState({ status: "loading", id });
    void getQuotation(id)
      .then((quotation) => setDetailsState({ status: "loaded", quotation }))
      .catch((error: unknown) =>
        setDetailsState({
          status: "error",
          id,
          message: getApiErrorMessage(error, "Unable to load quotation details."),
        }),
      );
  };

  const updateStatus = async (
    quotation: Quotation,
    action: "send" | "accept" | "expire",
  ) => {
    setBusyQuotationId(quotation.id);
    setMutationError(null);
    try {
      const update =
        action === "send"
          ? await sendQuotation(quotation.id)
          : action === "accept"
            ? await acceptQuotation(quotation.id)
            : await expireQuotation(quotation.id);
      toast.success(`${update.number} is now ${statusLabel(update.status)}.`);
      refresh();
    } catch (error) {
      setMutationError(
        getApiErrorMessage(error, `Unable to ${action} this quotation.`),
      );
    } finally {
      setBusyQuotationId(null);
    }
  };

  if (!canManage) {
    return (
      <ErrorState
        message="Your role does not have access to quotations."
        title="Access restricted"
      />
    );
  }
  if (state.status === "loading") return <Loading label="Loading quotations" />;
  if (state.status === "error") {
    return (
      <ErrorState
        message={state.message}
        onRetry={refresh}
        title="Quotations unavailable"
      />
    );
  }

  const selectClass =
    "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";
  const columns: DataTableColumn<Quotation>[] = [
    {
      key: "number",
      header: "Quotation",
      cell: (quotation) => (
        <div>
          <p className="font-semibold text-slate-900">{quotation.number}</p>
          <p className="mt-1 text-xs text-slate-500">
            Issued {formatDate(quotation.issuedAt)}
          </p>
        </div>
      ),
    },
    { key: "customer", header: "Customer", cell: (quotation) => quotation.customer.name },
    { key: "branch", header: "Branch", cell: (quotation) => quotation.branch.name },
    {
      key: "valid",
      header: "Valid until",
      cell: (quotation) => formatDate(quotation.validUntil),
    },
    {
      key: "status",
      header: "Status",
      cell: (quotation) => (
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(quotation.status)}`}>
          {statusLabel(quotation.status)}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total",
      className: "text-right",
      cell: (quotation) => formatMoney(quotation.total),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (quotation) => (
        <div className="flex items-center gap-1">
          <Button
            className="px-2.5"
            onClick={() => openDetails(quotation.id)}
            type="button"
            variant="ghost"
          >
            Details
          </Button>
          {canManage && quotation.status === "DRAFT" && (
            <>
              <Button
                className="px-2.5"
                onClick={() => {
                  setEditingQuotation(quotation);
                  setMutationError(null);
                  setFormOpen(true);
                }}
                type="button"
                variant="ghost"
              >
                Edit
              </Button>
              <Button
                className="px-2.5"
                disabled={busyQuotationId === quotation.id}
                onClick={() => void updateStatus(quotation, "send")}
                type="button"
                variant="ghost"
              >
                Send
              </Button>
            </>
          )}
          {canManage && quotation.status === "SENT" && (
            <>
              <Button
                className="px-2.5"
                disabled={busyQuotationId === quotation.id}
                onClick={() => void updateStatus(quotation, "accept")}
                type="button"
                variant="ghost"
              >
                Accept
              </Button>
              <Button
                className="px-2.5"
                disabled={busyQuotationId === quotation.id}
                onClick={() => void updateStatus(quotation, "expire")}
                type="button"
                variant="ghost"
              >
                Expire
              </Button>
            </>
          )}
          {canManage && quotation.status === "ACCEPTED" && (
            <Button
              className="px-2.5"
              onClick={() =>
                navigate(`/invoices?quotationId=${encodeURIComponent(quotation.id)}`)
              }
              type="button"
              variant="ghost"
            >
              Create invoice
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
            Sales
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Quotations
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Draft, send and track customer quotations.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditingQuotation(null);
              setMutationError(null);
              setFormOpen(true);
            }}
            type="button"
          >
            Create quotation
          </Button>
        )}
      </section>

      {mutationError && (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          {mutationError}
        </p>
      )}

      <form
        className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4"
        onSubmit={applyFilters}
      >
        <Input
          label="Search quotations"
          hint="Searches quotation number, customer name and email."
          onChange={(event) =>
            setDraftFilters({ ...draftFilters, search: event.target.value })
          }
          value={draftFilters.search}
        />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="quotation-status">
            Status
          </label>
          <select
            className={selectClass}
            id="quotation-status"
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                status: event.target.value as QuotationFilters["status"],
              })
            }
            value={draftFilters.status}
          >
            <option value="">All statuses</option>
            {quotationStatuses.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="quotation-customer-filter">
            Customer
          </label>
          <select
            className={selectClass}
            id="quotation-customer-filter"
            onChange={(event) =>
              setDraftFilters({ ...draftFilters, customerId: event.target.value })
            }
            value={draftFilters.customerId}
          >
            <option value="">All customers</option>
            {state.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="quotation-branch-filter">
            Branch
          </label>
          <select
            className={selectClass}
            id="quotation-branch-filter"
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
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="quotation-sort">
            Sort by
          </label>
          <select
            className={selectClass}
            id="quotation-sort"
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
            <option value="number">Quotation number</option>
            <option value="total">Total</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="quotation-sort-order">
            Direction
          </label>
          <select
            className={selectClass}
            id="quotation-sort-order"
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
        <div className="flex items-end gap-2 sm:col-span-2">
          <Button type="submit">Apply filters</Button>
          <Button onClick={resetFilters} type="button" variant="secondary">
            Reset
          </Button>
          <p className="ml-auto self-center text-sm text-slate-500">
            {state.result.pagination.total.toLocaleString()} quotations
          </p>
        </div>
      </form>

      <DataTable
        columns={columns}
        emptyMessage="No quotations match these filters."
        rowKey={(quotation) => quotation.id}
        rows={state.result.quotations}
      />
      {state.result.pagination.total > 0 && (
        <CatalogPagination
          onPageChange={setPage}
          pagination={state.result.pagination}
        />
      )}

      <Modal
        onClose={() => setFormOpen(false)}
        open={formOpen}
        title={editingQuotation ? `Edit ${editingQuotation.number}` : "Create quotation"}
      >
        <QuotationForm
          branches={state.branches}
          customers={state.customers}
          key={editingQuotation?.id ?? "new-quotation"}
          onCancel={() => setFormOpen(false)}
          onCreate={saveNewQuotation}
          onUpdate={saveQuotationChanges}
          products={state.products}
          quotation={editingQuotation}
        />
      </Modal>

      <Modal
        onClose={() => setDetailsOpen(false)}
        open={detailsOpen}
        title="Quotation details"
      >
        {detailsState?.status === "loading" ? (
          <Loading label="Loading quotation details" />
        ) : detailsState?.status === "error" ? (
          <ErrorState
            message={detailsState.message}
            onRetry={() => openDetails(detailsState.id)}
          />
        ) : detailsState?.status === "loaded" ? (
          <QuotationDetails quotation={detailsState.quotation} />
        ) : null}
      </Modal>
    </div>
  );
}

function QuotationDetails({ quotation }: { quotation: Quotation }) {
  return (
    <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Detail label="Number" value={quotation.number} />
        <Detail label="Status" value={statusLabel(quotation.status)} />
        <Detail label="Customer" value={quotation.customer.name} />
        <Detail label="Branch" value={quotation.branch.name} />
        <Detail label="Issued" value={formatDate(quotation.issuedAt, true)} />
        <Detail label="Valid until" value={formatDate(quotation.validUntil)} />
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
            {quotation.items.map((item) => (
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
        <MoneyRow label="Subtotal" value={quotation.subtotal} />
        <MoneyRow label="Tax" value={quotation.tax} />
        <MoneyRow label="Total" value={quotation.total} strong />
      </div>
      <Detail label="Notes" value={quotation.notes || "No notes"} />
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
    <div className={`flex justify-between ${strong ? "font-semibold text-slate-900" : "text-slate-600"}`}>
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
