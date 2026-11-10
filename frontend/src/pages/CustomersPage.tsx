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
import { CustomerForm } from "../features/sales/CustomerForm";
import {
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
  type Customer,
  type CustomerInput,
  type CustomerListResponse,
} from "../features/sales/salesApi";
import { formatDate } from "../features/sales/salesFormat";
import { getApiErrorMessage } from "../lib/api";

type CustomerPageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; result: CustomerListResponse };

type CustomerDetailsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; customer: Customer };

interface CustomerFilters {
  search: string;
  isActive: boolean;
  sortBy: "name" | "createdAt";
  sortOrder: "asc" | "desc";
}

const pageSize = 10;
const initialFilters: CustomerFilters = {
  search: "",
  isActive: true,
  sortBy: "name",
  sortOrder: "asc",
};

export function CustomersPage() {
  const { user } = useAuth();
  const canManage =
    user?.role === "ADMIN" ||
    user?.role === "MANAGER" ||
    user?.role === "SALES";
  const [state, setState] = useState<CustomerPageState>({ status: "loading" });
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [reloadCount, setReloadCount] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [detailsState, setDetailsState] = useState<CustomerDetailsState>({
    status: "loading",
  });
  const [busyCustomerId, setBusyCustomerId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    void listCustomers({
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
            message: getApiErrorMessage(error, "Unable to load customers."),
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

  const openForm = (customer: Customer | null) => {
    setEditingCustomer(customer);
    setFormOpen(true);
    setMutationError(null);
  };

  const saveCustomer = async (input: CustomerInput) => {
    if (editingCustomer) {
      await updateCustomer(editingCustomer.id, input);
      toast.success("Customer updated.");
    } else {
      await createCustomer(input);
      toast.success("Customer created.");
    }
    setFormOpen(false);
    setPage(1);
    refresh();
  };

  const toggleCustomerStatus = async (customer: Customer) => {
    setBusyCustomerId(customer.id);
    setMutationError(null);
    try {
      await updateCustomer(customer.id, { isActive: !customer.isActive });
      toast.success(customer.isActive ? "Customer deactivated." : "Customer activated.");
      refresh();
    } catch (error) {
      setMutationError(
        getApiErrorMessage(error, "Unable to update customer status."),
      );
    } finally {
      setBusyCustomerId(null);
    }
  };

  const openDetails = (id: string) => {
    setDetailsId(id);
    setDetailsOpen(true);
    setDetailsState({ status: "loading" });
    void getCustomer(id)
      .then((customer) => setDetailsState({ status: "loaded", customer }))
      .catch((error: unknown) =>
        setDetailsState({
          status: "error",
          message: getApiErrorMessage(error, "Unable to load customer details."),
        }),
      );
  };

  const columns: DataTableColumn<Customer>[] = [
    {
      key: "customer",
      header: "Customer",
      cell: (customer) => (
        <div>
          <p className="font-semibold text-slate-900">{customer.name}</p>
          <p className="mt-1 text-xs text-slate-500">{customer.email || "No email"}</p>
        </div>
      ),
    },
    { key: "phone", header: "Phone", cell: (customer) => customer.phone || "—" },
    {
      key: "tax",
      header: "Tax number",
      cell: (customer) => customer.taxNumber || "—",
    },
    {
      key: "status",
      header: "Status",
      cell: (customer) => (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            customer.isActive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {customer.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (customer) => (
        <div className="flex items-center gap-1">
          <Button
            className="px-2.5"
            onClick={() => openDetails(customer.id)}
            type="button"
            variant="ghost"
          >
            Details
          </Button>
          {canManage && (
            <>
              <Button
                className="px-2.5"
                onClick={() => openForm(customer)}
                type="button"
                variant="ghost"
              >
                Edit
              </Button>
              <Button
                className="px-2.5"
                disabled={busyCustomerId === customer.id}
                onClick={() => void toggleCustomerStatus(customer)}
                type="button"
                variant="ghost"
              >
                {customer.isActive ? "Deactivate" : "Activate"}
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  if (!canManage) {
    return (
      <ErrorState
        message="Your role does not have access to customer management."
        title="Access restricted"
      />
    );
  }
  if (state.status === "loading") return <Loading label="Loading customers" />;
  if (state.status === "error") {
    return (
      <ErrorState
        message={state.message}
        onRetry={refresh}
        title="Customers unavailable"
      />
    );
  }

  const selectClass =
    "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
            Sales
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Customers
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Manage customer contact and billing details.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => openForm(null)} type="button">
            Add customer
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
        className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-5"
        onSubmit={applyFilters}
      >
        <Input
          label="Search customers"
          hint="Searches name, email, phone and tax number."
          onChange={(event) =>
            setDraftFilters({ ...draftFilters, search: event.target.value })
          }
          value={draftFilters.search}
        />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="customer-status">
            Status
          </label>
          <select
            className={selectClass}
            id="customer-status"
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
          <label className="block text-sm font-medium text-slate-700" htmlFor="customer-sort">
            Sort by
          </label>
          <select
            className={selectClass}
            id="customer-sort"
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                sortBy: event.target.value === "createdAt" ? "createdAt" : "name",
              })
            }
            value={draftFilters.sortBy}
          >
            <option value="name">Name</option>
            <option value="createdAt">Date added</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="customer-sort-order">
            Direction
          </label>
          <select
            className={selectClass}
            id="customer-sort-order"
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                sortOrder: event.target.value === "desc" ? "desc" : "asc",
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
        emptyMessage="No customers match these filters."
        rowKey={(customer) => customer.id}
        rows={state.result.customers}
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
        title={editingCustomer ? "Edit customer" : "Create customer"}
      >
        <CustomerForm
          customer={editingCustomer}
          key={editingCustomer?.id ?? "new-customer"}
          onCancel={() => setFormOpen(false)}
          onSave={saveCustomer}
        />
      </Modal>

      <Modal
        onClose={() => setDetailsOpen(false)}
        open={detailsOpen}
        title="Customer details"
      >
        {detailsState.status === "loading" ? (
          <Loading label="Loading customer details" />
        ) : detailsState.status === "error" ? (
          <ErrorState
            message={detailsState.message}
            onRetry={() => detailsId && openDetails(detailsId)}
          />
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Name" value={detailsState.customer.name} />
            <Detail label="Email" value={detailsState.customer.email || "—"} />
            <Detail label="Phone" value={detailsState.customer.phone || "—"} />
            <Detail label="Tax number" value={detailsState.customer.taxNumber || "—"} />
            <Detail label="Status" value={detailsState.customer.isActive ? "Active" : "Inactive"} />
            <Detail label="Created" value={formatDate(detailsState.customer.createdAt)} />
            <div className="sm:col-span-2">
              <Detail
                label="Address"
                value={detailsState.customer.address || "No address provided"}
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
