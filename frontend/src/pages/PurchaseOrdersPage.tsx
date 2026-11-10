import { useEffect, useState, type FormEvent } from "react";
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
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  listSuppliers,
  receivePurchaseOrder,
  updatePurchaseOrder,
  type PurchaseOrder,
  type PurchaseOrderInput,
  type PurchaseOrderListResponse,
  type PurchaseOrderStatus,
  type PurchaseOrderUpdate,
  type ReceivePurchaseOrderInput,
  type Supplier,
} from "../features/purchasing/purchasingApi";
import { PurchaseOrderForm } from "../features/purchasing/PurchaseOrderForm";
import { ReceivePurchaseOrderForm } from "../features/purchasing/ReceivePurchaseOrderForm";
import { listBranches, type BranchOption } from "../features/stock/stockApi";
import { getApiErrorMessage } from "../lib/api";

type PurchaseOrderPageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "loaded";
      result: PurchaseOrderListResponse;
      suppliers: Supplier[];
      branches: BranchOption[];
      products: Product[];
    };

type OrderDialogState =
  | { mode: "details" | "receive"; status: "loading"; id: string }
  | {
      mode: "details" | "receive";
      status: "error";
      id: string;
      message: string;
    }
  | { mode: "details" | "receive"; status: "loaded"; order: PurchaseOrder };

interface PurchaseOrderFilters {
  search: string;
  status: "" | PurchaseOrderStatus;
  supplierId: string;
  branchId: string;
  sortBy: "number" | "orderedAt" | "createdAt" | "total";
  sortOrder: "asc" | "desc";
}

const pageSize = 10;
const initialFilters: PurchaseOrderFilters = {
  search: "",
  status: "",
  supplierId: "",
  branchId: "",
  sortBy: "orderedAt",
  sortOrder: "desc",
};

const statuses: PurchaseOrderStatus[] = [
  "DRAFT",
  "APPROVED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
];

const statusClass: Record<PurchaseOrderStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  APPROVED: "bg-indigo-50 text-indigo-700",
  PARTIALLY_RECEIVED: "bg-amber-50 text-amber-700",
  RECEIVED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-rose-50 text-rose-700",
};

function statusLabel(status: PurchaseOrderStatus): string {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function formatMoney(value: string): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null, withTime = false): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

export function PurchaseOrdersPage() {
  const { user } = useAuth();
  const canCreate = ["ADMIN", "MANAGER", "STOREKEEPER"].includes(
    user?.role ?? "",
  );
  const canApprove = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [state, setState] = useState<PurchaseOrderPageState>({
    status: "loading",
  });
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [reloadCount, setReloadCount] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [orderDialog, setOrderDialog] = useState<OrderDialogState | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrder | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const params = {
      page,
      limit: pageSize,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
    };

    void Promise.all([
      listPurchaseOrders(params),
      listSuppliers({
        page: 1,
        limit: 100,
        isActive: true,
        sortBy: "name",
        sortOrder: "asc",
      }),
      listBranches(),
      listProducts({ page: 1, limit: 100, isActive: true }),
    ])
      .then(([result, supplierResult, branchResult, productResult]) => {
        if (active) {
          setState({
            status: "loaded",
            result,
            suppliers: supplierResult.suppliers,
            branches: branchResult.branches,
            products: productResult.products,
          });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message: getApiErrorMessage(
              error,
              "Unable to load purchase orders.",
            ),
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

  const openOrderDialog = async (
    id: string,
    mode: "details" | "receive",
  ) => {
    setOrderDialog({ mode, status: "loading", id });
    try {
      const order = await getPurchaseOrder(id);
      setOrderDialog({ mode, status: "loaded", order });
    } catch (error) {
      setOrderDialog({
        mode,
        status: "error",
        id,
        message: getApiErrorMessage(error, "Unable to load purchase order."),
      });
    }
  };

  const saveNewOrder = async (input: PurchaseOrderInput) => {
    const order = await createPurchaseOrder(input);
    toast.success(`Draft ${order.number} created.`);
    setFormOpen(false);
    setPage(1);
    refresh();
  };

  const saveOrderChanges = async (
    id: string,
    input: PurchaseOrderUpdate,
  ) => {
    const order = await updatePurchaseOrder(id, input);
    toast.success(`Draft ${order.number} updated.`);
    setFormOpen(false);
    refresh();
  };

  const handleApprove = async (order: PurchaseOrder) => {
    setBusyOrderId(order.id);
    setMutationError(null);
    try {
      await approvePurchaseOrder(order.id);
      toast.success(`${order.number} approved.`);
      refresh();
    } catch (error) {
      setMutationError(
        getApiErrorMessage(error, "Unable to approve this purchase order."),
      );
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setBusyOrderId(cancelTarget.id);
    setMutationError(null);
    try {
      await cancelPurchaseOrder(cancelTarget.id);
      toast.success(`${cancelTarget.number} cancelled.`);
      setCancelTarget(null);
      refresh();
    } catch (error) {
      setMutationError(
        getApiErrorMessage(error, "Unable to cancel this purchase order."),
      );
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleReceive = async (input: ReceivePurchaseOrderInput) => {
    if (!orderDialog || orderDialog.status !== "loaded") return;
    const receipt = await receivePurchaseOrder(orderDialog.order.id, input);
    toast.success(`Goods receipt ${receipt.goodsReceipt.number} recorded.`);
    setOrderDialog(null);
    refresh();
  };

  if (state.status === "loading") {
    return <Loading label="Loading purchase orders" />;
  }
  if (state.status === "error") {
    return (
      <ErrorState
        message={state.message}
        onRetry={refresh}
        title="Purchase orders unavailable"
      />
    );
  }

  const canCancel = (order: PurchaseOrder) =>
    order.status === "DRAFT" ||
    (order.status === "APPROVED" && canApprove);

  const columns: DataTableColumn<PurchaseOrder>[] = [
    {
      key: "number",
      header: "Purchase order",
      cell: (order) => (
        <div>
          <p className="font-semibold text-slate-900">{order.number}</p>
          <p className="mt-1 text-xs text-slate-500">
            Ordered {formatDate(order.orderedAt)}
          </p>
        </div>
      ),
    },
    {
      key: "supplier",
      header: "Supplier",
      cell: (order) => order.supplier.name,
    },
    {
      key: "branch",
      header: "Branch",
      cell: (order) => order.branch.name,
    },
    {
      key: "expected",
      header: "Expected",
      cell: (order) => formatDate(order.expectedAt),
    },
    {
      key: "status",
      header: "Status",
      cell: (order) => (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[order.status]}`}
        >
          {statusLabel(order.status)}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total",
      className: "text-right",
      cell: (order) => formatMoney(order.total),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (order) => (
        <div className="flex items-center gap-1">
          <Button
            className="px-2.5"
            onClick={() => void openOrderDialog(order.id, "details")}
            type="button"
            variant="ghost"
          >
            Details
          </Button>
          {canCreate && order.status === "DRAFT" && (
            <Button
              className="px-2.5"
              onClick={() => {
                setEditingOrder(order);
                setFormOpen(true);
                setMutationError(null);
              }}
              type="button"
              variant="ghost"
            >
              Edit
            </Button>
          )}
          {canApprove && order.status === "DRAFT" && (
            <Button
              className="px-2.5"
              disabled={busyOrderId === order.id}
              onClick={() => void handleApprove(order)}
              type="button"
              variant="ghost"
            >
              Approve
            </Button>
          )}
          {(order.status === "APPROVED" ||
            order.status === "PARTIALLY_RECEIVED") && (
            <Button
              className="px-2.5"
              onClick={() => void openOrderDialog(order.id, "receive")}
              type="button"
              variant="ghost"
            >
              Receive
            </Button>
          )}
          {canCancel(order) && (
            <Button
              className="px-2.5"
              disabled={busyOrderId === order.id}
              onClick={() => setCancelTarget(order)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          )}
        </div>
      ),
    },
  ];

  const filterSelectClass =
    "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
            Purchasing
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Purchase orders
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Create draft orders, track approvals and record goods received.
          </p>
        </div>
        {canCreate && (
          <Button
            onClick={() => {
              setEditingOrder(null);
              setMutationError(null);
              setFormOpen(true);
            }}
            type="button"
          >
            Create purchase order
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
        <Input
          label="Search"
          hint="Purchase order number or supplier name."
          onChange={(event) =>
            setDraftFilters({ ...draftFilters, search: event.target.value })
          }
          value={draftFilters.search}
        />
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="po-status-filter"
          >
            Status
          </label>
          <select
            className={filterSelectClass}
            id="po-status-filter"
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                status: event.target.value as PurchaseOrderFilters["status"],
              })
            }
            value={draftFilters.status}
          >
            <option value="">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="po-supplier-filter"
          >
            Supplier
          </label>
          <select
            className={filterSelectClass}
            id="po-supplier-filter"
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                supplierId: event.target.value,
              })
            }
            value={draftFilters.supplierId}
          >
            <option value="">All suppliers</option>
            {state.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="po-branch-filter"
          >
            Branch
          </label>
          <select
            className={filterSelectClass}
            id="po-branch-filter"
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                branchId: event.target.value,
              })
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
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="po-sort-by"
          >
            Sort by
          </label>
          <select
            className={filterSelectClass}
            id="po-sort-by"
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                sortBy: event.target.value as PurchaseOrderFilters["sortBy"],
              })
            }
            value={draftFilters.sortBy}
          >
            <option value="orderedAt">Order date</option>
            <option value="createdAt">Date added</option>
            <option value="number">Order number</option>
            <option value="total">Total</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="po-sort-order"
          >
            Direction
          </label>
          <select
            className={filterSelectClass}
            id="po-sort-order"
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                sortOrder: event.target.value as PurchaseOrderFilters["sortOrder"],
              })
            }
            value={draftFilters.sortOrder}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-2">
          <Button type="submit">Search</Button>
          <Button onClick={resetFilters} type="button" variant="secondary">
            Reset
          </Button>
          <p className="ml-auto self-center text-sm text-slate-500">
            {state.result.pagination.total.toLocaleString()} orders
          </p>
        </div>
      </form>

      <DataTable
        columns={columns}
        emptyMessage="No purchase orders match these filters."
        rowKey={(order) => order.id}
        rows={state.result.purchaseOrders}
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
        title={editingOrder ? `Edit ${editingOrder.number}` : "Create purchase order"}
      >
        <PurchaseOrderForm
          branches={state.branches}
          key={editingOrder?.id ?? "new-purchase-order"}
          onCancel={() => setFormOpen(false)}
          onCreate={saveNewOrder}
          onUpdate={saveOrderChanges}
          order={editingOrder}
          products={state.products}
          suppliers={state.suppliers}
        />
      </Modal>

      <Modal
        onClose={() => setOrderDialog(null)}
        open={orderDialog !== null}
        title={
          orderDialog?.mode === "receive"
            ? "Receive purchase order"
            : "Purchase order details"
        }
      >
        {orderDialog?.status === "loading" ? (
          <Loading label="Loading purchase order" />
        ) : orderDialog?.status === "error" ? (
          <ErrorState
            message={orderDialog.message}
            onRetry={() => void openOrderDialog(orderDialog.id, orderDialog.mode)}
          />
        ) : orderDialog?.mode === "receive" &&
          orderDialog.status === "loaded" ? (
          <ReceivePurchaseOrderForm
            key={orderDialog.order.id}
            onCancel={() => setOrderDialog(null)}
            onSave={handleReceive}
            order={orderDialog.order}
          />
        ) : orderDialog?.status === "loaded" ? (
          <PurchaseOrderDetails order={orderDialog.order} />
        ) : null}
      </Modal>

      <Modal
        onClose={() => setCancelTarget(null)}
        open={cancelTarget !== null}
        title="Cancel purchase order"
      >
        {cancelTarget && (
          <div className="space-y-5">
            <p className="text-sm text-slate-600">
              Cancel <span className="font-semibold text-slate-900">{cancelTarget.number}</span>?
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => setCancelTarget(null)}
                type="button"
                variant="secondary"
              >
                Keep order
              </Button>
              <Button
                loading={busyOrderId === cancelTarget.id}
                onClick={() => void handleCancel()}
                type="button"
                variant="danger"
              >
                Cancel order
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function PurchaseOrderDetails({ order }: { order: PurchaseOrder }) {
  return (
    <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Detail label="Order number" value={order.number} />
        <Detail label="Status" value={statusLabel(order.status)} />
        <Detail label="Supplier" value={order.supplier.name} />
        <Detail label="Branch" value={order.branch.name} />
        <Detail label="Ordered" value={formatDate(order.orderedAt, true)} />
        <Detail label="Expected" value={formatDate(order.expectedAt)} />
      </dl>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3 text-right">Ordered</th>
              <th className="px-4 py-3 text-right">Received</th>
              <th className="px-4 py-3 text-right">Unit cost</th>
              <th className="px-4 py-3 text-right">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {order.items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{item.product.name}</p>
                  <p className="text-xs text-slate-500">{item.product.sku}</p>
                </td>
                <td className="px-4 py-3 text-right">
                  {item.quantity.toLocaleString()} {item.product.unit}
                </td>
                <td className="px-4 py-3 text-right">
                  {item.receivedQuantity.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right">{formatMoney(item.unitCost)}</td>
                <td className="px-4 py-3 text-right">{formatMoney(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ml-auto max-w-xs space-y-2 border-t border-slate-100 pt-4 text-sm">
        <MoneyRow label="Subtotal" value={order.subtotal} />
        <MoneyRow label="Tax" value={order.tax} />
        <MoneyRow label="Total" value={order.total} strong />
      </div>
      <Detail label="Notes" value={order.notes || "No notes"} />
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
