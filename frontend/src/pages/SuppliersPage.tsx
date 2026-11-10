import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "../components/ui/Button";
import { DataTable, type DataTableColumn } from "../components/ui/DataTable";
import { ErrorState } from "../components/ui/ErrorState";
import { Input } from "../components/ui/Input";
import { Loading } from "../components/ui/Loading";
import { Modal } from "../components/ui/Modal";
import { useAuth } from "../features/auth/useAuth";
import { CatalogPagination } from "../features/catalog/CatalogPagination";
import {
  createSupplier,
  getSupplier,
  listSuppliers,
  updateSupplier,
  type Supplier,
  type SupplierInput,
  type SupplierListResponse,
} from "../features/purchasing/purchasingApi";
import { SupplierForm } from "../features/purchasing/SupplierForm";
import { getApiErrorMessage } from "../lib/api";

type SupplierPageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; result: SupplierListResponse };

type SupplierDetailsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; supplier: Supplier };

interface SupplierFilters {
  search: string;
  isActive: boolean;
  sortBy: "name" | "createdAt";
  sortOrder: "asc" | "desc";
}

const pageSize = 10;
const initialFilters: SupplierFilters = {
  search: "",
  isActive: true,
  sortBy: "name",
  sortOrder: "asc",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SuppliersPage() {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [state, setState] = useState<SupplierPageState>({ status: "loading" });
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [reloadCount, setReloadCount] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [detailsState, setDetailsState] = useState<SupplierDetailsState>({
    status: "loading",
  });
  const [busySupplierId, setBusySupplierId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listSuppliers({
      page,
      limit: pageSize,
      isActive: filters.isActive,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      ...(filters.search ? { search: filters.search } : {}),
    })
      .then((result) => {
        if (active) setState({ status: "loaded", result });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message: getApiErrorMessage(error, "Unable to load suppliers."),
          });
        }
      });

    return () => {
      active = false;
    };
  }, [filters, page, reloadCount]);

  const refresh = () => {
    setMutationError(null);
    setState({ status: "loading" });
    setReloadCount((count) => count + 1);
  };

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState({ status: "loading" });
    setPage(1);
    setFilters({
      ...draftFilters,
      search: draftFilters.search.trim(),
    });
  };

  const resetFilters = () => {
    setDraftFilters(initialFilters);
    setFilters(initialFilters);
    setPage(1);
    setState({ status: "loading" });
    setReloadCount((count) => count + 1);
  };

  const openForm = (supplier: Supplier | null) => {
    setEditingSupplier(supplier);
    setFormOpen(true);
    setMutationError(null);
  };

  const saveSupplier = async (input: SupplierInput) => {
    if (editingSupplier) {
      await updateSupplier(editingSupplier.id, input);
      toast.success("Supplier updated.");
    } else {
      await createSupplier(input);
      toast.success("Supplier created.");
    }
    setFormOpen(false);
    setPage(1);
    refresh();
  };

  const toggleSupplierStatus = async (supplier: Supplier) => {
    setMutationError(null);
    setBusySupplierId(supplier.id);
    try {
      await updateSupplier(supplier.id, { isActive: !supplier.isActive });
      toast.success(supplier.isActive ? "Supplier deactivated." : "Supplier activated.");
      refresh();
    } catch (error) {
      setMutationError(
        getApiErrorMessage(error, "Unable to update supplier status."),
      );
    } finally {
      setBusySupplierId(null);
    }
  };

  const openDetails = (id: string) => {
    setDetailsId(id);
    setDetailsOpen(true);
    setDetailsState({ status: "loading" });
    void getSupplier(id)
      .then((supplier) => setDetailsState({ status: "loaded", supplier }))
      .catch((error: unknown) =>
        setDetailsState({
          status: "error",
          message: getApiErrorMessage(error, "Unable to load supplier details."),
        }),
      );
  };

  const columns: DataTableColumn<Supplier>[] = [
    {
      key: "supplier",
      header: "Supplier",
      cell: (supplier) => (
        <div>
          <p className="font-semibold text-slate-900">{supplier.name}</p>
          <p className="mt-1 text-xs text-slate-500">
            {supplier.contactName || "No contact name"}
          </p>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      cell: (supplier) => supplier.email || "—",
    },
    {
      key: "phone",
      header: "Phone",
      cell: (supplier) => supplier.phone || "—",
    },
    {
      key: "tax",
      header: "Tax number",
      cell: (supplier) => supplier.taxNumber || "—",
    },
    {
      key: "status",
      header: "Status",
      cell: (supplier) => (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            supplier.isActive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {supplier.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (supplier) => (
        <div className="flex items-center gap-1">
          <Button
            className="px-2.5"
            onClick={() => openDetails(supplier.id)}
            type="button"
            variant="ghost"
          >
            Details
          </Button>
          {canManage && (
            <>
              <Button
                className="px-2.5"
                onClick={() => openForm(supplier)}
                type="button"
                variant="ghost"
              >
                Edit
              </Button>
              <Button
                className="px-2.5"
                disabled={busySupplierId === supplier.id}
                onClick={() => void toggleSupplierStatus(supplier)}
                type="button"
                variant="ghost"
              >
                {supplier.isActive ? "Deactivate" : "Activate"}
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  if (state.status === "loading") {
    return <Loading label="Loading suppliers" />;
  }
  if (state.status === "error") {
    return (
      <ErrorState
        message={state.message}
        onRetry={refresh}
        title="Suppliers unavailable"
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
            Purchasing
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Suppliers
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Manage supplier contact and account information.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => openForm(null)} type="button">
            Add supplier
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
        className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_auto]"
        onSubmit={applyFilters}
      >
        <Input
          label="Search suppliers"
          hint="Searches name, contact, email and tax number."
          onChange={(event) =>
            setDraftFilters({ ...draftFilters, search: event.target.value })
          }
          value={draftFilters.search}
        />
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="supplier-status-filter"
          >
            Status
          </label>
          <select
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            id="supplier-status-filter"
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                isActive: event.target.value === "active",
              })
            }
            value={draftFilters.isActive ? "active" : "inactive"}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="supplier-sort-by"
          >
            Sort by
          </label>
          <select
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            id="supplier-sort-by"
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                sortBy: event.target.value as SupplierFilters["sortBy"],
              })
            }
            value={draftFilters.sortBy}
          >
            <option value="name">Name</option>
            <option value="createdAt">Date added</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="supplier-sort-order"
          >
            Direction
          </label>
          <select
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            id="supplier-sort-order"
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                sortOrder: event.target.value as SupplierFilters["sortOrder"],
              })
            }
            value={draftFilters.sortOrder}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">Search</Button>
          <Button onClick={resetFilters} type="button" variant="secondary">
            Reset
          </Button>
        </div>
      </form>

      <DataTable
        columns={columns}
        emptyMessage="No suppliers match these filters."
        rowKey={(supplier) => supplier.id}
        rows={state.result.suppliers}
      />
      {state.result.pagination.total > 0 && (
        <CatalogPagination
          onPageChange={(nextPage) => setPage(nextPage)}
          pagination={state.result.pagination}
        />
      )}

      <Modal
        onClose={() => setFormOpen(false)}
        open={formOpen}
        title={editingSupplier ? "Edit supplier" : "Create supplier"}
      >
        <SupplierForm
          key={editingSupplier?.id ?? "new-supplier"}
          onCancel={() => setFormOpen(false)}
          onSave={saveSupplier}
          supplier={editingSupplier}
        />
      </Modal>

      <Modal
        onClose={() => setDetailsOpen(false)}
        open={detailsOpen}
        title="Supplier details"
      >
        {detailsState.status === "loading" ? (
          <Loading label="Loading supplier details" />
        ) : detailsState.status === "error" ? (
          <ErrorState
            message={detailsState.message}
            onRetry={() => detailsId && openDetails(detailsId)}
          />
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Name" value={detailsState.supplier.name} />
            <Detail
              label="Contact"
              value={detailsState.supplier.contactName || "—"}
            />
            <Detail label="Email" value={detailsState.supplier.email || "—"} />
            <Detail label="Phone" value={detailsState.supplier.phone || "—"} />
            <Detail
              label="Tax number"
              value={detailsState.supplier.taxNumber || "—"}
            />
            <Detail
              label="Status"
              value={detailsState.supplier.isActive ? "Active" : "Inactive"}
            />
            <Detail
              label="Created"
              value={formatDate(detailsState.supplier.createdAt)}
            />
            <div className="sm:col-span-2">
              <Detail
                label="Address"
                value={detailsState.supplier.address || "No address provided"}
              />
            </div>
          </dl>
        )}
      </Modal>
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
