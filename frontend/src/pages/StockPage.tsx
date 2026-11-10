import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "../components/ui/Button";
import { DataTable, type DataTableColumn } from "../components/ui/DataTable";
import { ErrorState } from "../components/ui/ErrorState";
import { Input } from "../components/ui/Input";
import { Loading } from "../components/ui/Loading";
import { Modal } from "../components/ui/Modal";
import { useAuth } from "../features/auth/useAuth";
import {
  listCategories,
  listProducts,
  type Category,
  type Product,
} from "../features/catalog/catalogApi";
import { CatalogPagination } from "../features/catalog/CatalogPagination";
import { StockAdjustmentForm } from "../features/stock/StockAdjustmentForm";
import { StockTransferForm } from "../features/stock/StockTransferForm";
import {
  adjustStock,
  listBranches,
  listStock,
  transferStock,
  type AdjustStockInput,
  type BranchOption,
  type StockListResponse,
  type StockRecord,
  type StockStatus,
  type TransferStockInput,
} from "../features/stock/stockApi";
import type {
  StockAdjustmentFormValues,
} from "../features/stock/stockSchemas";
import { getApiErrorMessage } from "../lib/api";

type StockPageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "loaded";
      result: StockListResponse;
      branches: BranchOption[];
      categories: Category[];
      products: Product[];
    };

interface StockFilters {
  search: string;
  branchId: string;
  categoryId: string;
  status: "" | StockStatus;
  sortBy: "quantity" | "createdAt";
  sortOrder: "asc" | "desc";
}

interface RecentTransfer {
  transferId: string;
  fromBranchId: string;
  toBranchId: string;
  items: TransferStockInput["items"];
  createdAt: string;
}

const pageSize = 10;
const initialFilters: StockFilters = {
  search: "",
  branchId: "",
  categoryId: "",
  status: "",
  sortBy: "createdAt",
  sortOrder: "desc",
};

function getStockStatus(stock: StockRecord): StockStatus {
  if (stock.quantity === 0) return "OUT_OF_STOCK";
  return stock.quantity <= stock.product.reorderLevel
    ? "LOW_STOCK"
    : "IN_STOCK";
}

function stockStatusLabel(status: StockStatus): string {
  if (status === "OUT_OF_STOCK") return "Out of stock";
  if (status === "LOW_STOCK") return "Low stock";
  return "In stock";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function StockPage() {
  const { user } = useAuth();
  const canManageAcrossBranches =
    user?.role === "ADMIN" || user?.role === "MANAGER";
  const canAdjust =
    canManageAcrossBranches || user?.role === "STOREKEEPER";
  const [state, setState] = useState<StockPageState>({ status: "loading" });
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [reloadCount, setReloadCount] = useState(0);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [recentTransfers, setRecentTransfers] = useState<RecentTransfer[]>([]);

  useEffect(() => {
    let active = true;
    const params = {
      page,
      limit: pageSize,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };

    void Promise.all([
      listStock(params),
      listBranches(),
      listCategories({ page: 1, limit: 100, isActive: true }),
      listCategories({ page: 1, limit: 100, isActive: false }),
      listProducts({ page: 1, limit: 100, isActive: true }),
    ])
      .then(
        ([
          result,
          branchResult,
          activeCategories,
          inactiveCategories,
          productResult,
        ]) => {
          if (active) {
            setState({
              status: "loaded",
              result,
              branches: branchResult.branches,
              categories: [
                ...activeCategories.categories,
                ...inactiveCategories.categories,
              ],
              products: productResult.products,
            });
          }
        },
      )
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message: getApiErrorMessage(error, "Unable to load stock data."),
          });
        }
      });

    return () => {
      active = false;
    };
  }, [filters, page, reloadCount]);

  const branchNames = useMemo(() => {
    if (state.status !== "loaded") return new Map<string, string>();
    return new Map(state.branches.map((branch) => [branch.id, branch.name]));
  }, [state]);
  const productNames = useMemo(() => {
    if (state.status !== "loaded") return new Map<string, string>();
    return new Map(state.products.map((product) => [product.id, product.name]));
  }, [state]);

  const refresh = () => {
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

  const applyAdjustment = async (values: StockAdjustmentFormValues) => {
    const input: AdjustStockInput = {
      branchId: values.branchId,
      productId: values.productId,
      quantity:
        values.direction === "DECREASE" ? -values.quantity : values.quantity,
      notes: values.notes.trim(),
    };
    await adjustStock(input);
    setAdjustmentOpen(false);
    toast.success("Stock adjustment applied.");
    setPage(1);
    refresh();
  };

  const completeTransfer = async (input: TransferStockInput) => {
    const result = await transferStock(input);
    setRecentTransfers((transfers) =>
      [
        {
          transferId: result.transferId,
          fromBranchId: result.fromBranchId,
          toBranchId: result.toBranchId,
          items: input.items,
          createdAt: new Date().toISOString(),
        },
        ...transfers,
      ].slice(0, 20),
    );
    setTransferOpen(false);
    toast.success("Stock transfer completed.");
    setPage(1);
    refresh();
  };

  const stockColumns: DataTableColumn<StockRecord>[] = [
    {
      key: "product",
      header: "Product",
      cell: (stock) => (
        <div>
          <p className="font-semibold text-slate-900">{stock.product.name}</p>
          <p className="mt-1 text-xs text-slate-500">
            {stock.product.sku}
            {stock.product.barcode ? ` · ${stock.product.barcode}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "branch",
      header: "Branch",
      cell: (stock) => stock.branch.name,
    },
    {
      key: "category",
      header: "Category",
      cell: (stock) => stock.product.category.name,
    },
    {
      key: "quantity",
      header: "Available",
      className: "text-right",
      cell: (stock) => (
        <span className="font-semibold text-slate-900">
          {stock.quantity.toLocaleString()} {stock.product.unit}
        </span>
      ),
    },
    {
      key: "reorder",
      header: "Reorder level",
      className: "text-right",
      cell: (stock) => stock.product.reorderLevel.toLocaleString(),
    },
    {
      key: "status",
      header: "Status",
      cell: (stock) => {
        const status = getStockStatus(stock);
        const classes =
          status === "OUT_OF_STOCK"
            ? "bg-rose-50 text-rose-700"
            : status === "LOW_STOCK"
              ? "bg-amber-50 text-amber-700"
              : "bg-emerald-50 text-emerald-700";
        return (
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}>
            {stockStatusLabel(status)}
          </span>
        );
      },
    },
    {
      key: "updated",
      header: "Last updated",
      cell: (stock) => formatDate(stock.updatedAt),
    },
  ];

  const transferColumns: DataTableColumn<RecentTransfer>[] = [
    {
      key: "transfer",
      header: "Transfer",
      cell: (transfer) => (
        <span className="font-mono text-xs text-slate-700">
          {transfer.transferId}
        </span>
      ),
    },
    {
      key: "route",
      header: "Route",
      cell: (transfer) => (
        <span>
          {branchNames.get(transfer.fromBranchId) ?? transfer.fromBranchId}
          <span className="mx-2 text-slate-400" aria-hidden="true">
            →
          </span>
          {branchNames.get(transfer.toBranchId) ?? transfer.toBranchId}
        </span>
      ),
    },
    {
      key: "items",
      header: "Items",
      cell: (transfer) => (
        <div className="space-y-1">
          {transfer.items.map((item) => (
            <p key={item.productId}>
              {productNames.get(item.productId) ?? item.productId} ·{" "}
              {item.quantity}
            </p>
          ))}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: () => (
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
          Completed
        </span>
      ),
    },
    {
      key: "created",
      header: "Completed",
      cell: (transfer) => formatDate(transfer.createdAt),
    },
  ];

  if (state.status === "loading") {
    return <Loading label="Loading stock" />;
  }
  if (state.status === "error") {
    return (
      <ErrorState
        message={state.message}
        onRetry={refresh}
        title="Stock unavailable"
      />
    );
  }

  const ownBranchId =
    !canManageAcrossBranches && user?.role === "STOREKEEPER"
      ? user.branchId
      : null;

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
            Inventory
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Stock &amp; transfers
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Review branch availability, adjust quantities, and move stock between branches.
          </p>
        </div>
        {canAdjust && (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setAdjustmentOpen(true)}
              type="button"
              variant="secondary"
            >
              Adjust stock
            </Button>
            <Button onClick={() => setTransferOpen(true)} type="button">
              Transfer stock
            </Button>
          </div>
        )}
      </section>

      <form
        className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4"
        onSubmit={applyFilters}
      >
        <Input
          label="Search name, SKU or barcode"
          onChange={(event) =>
            setDraftFilters({ ...draftFilters, search: event.target.value })
          }
          value={draftFilters.search}
        />
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="stock-branch-filter"
          >
            Branch
          </label>
          <select
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            id="stock-branch-filter"
            onChange={(event) =>
              setDraftFilters({ ...draftFilters, branchId: event.target.value })
            }
            value={draftFilters.branchId}
          >
            {canManageAcrossBranches && <option value="">All branches</option>}
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
            htmlFor="stock-category-filter"
          >
            Category
          </label>
          <select
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            id="stock-category-filter"
            onChange={(event) =>
              setDraftFilters({ ...draftFilters, categoryId: event.target.value })
            }
            value={draftFilters.categoryId}
          >
            <option value="">All categories</option>
            {state.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {!category.isActive ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="stock-status-filter"
          >
            Stock status
          </label>
          <select
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            id="stock-status-filter"
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                status: event.target.value as "" | StockStatus,
              })
            }
            value={draftFilters.status}
          >
            <option value="">All stock</option>
            <option value="IN_STOCK">In stock</option>
            <option value="LOW_STOCK">Low stock</option>
            <option value="OUT_OF_STOCK">Out of stock</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="stock-sort"
          >
            Sort
          </label>
          <select
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            id="stock-sort"
            onChange={(event) => {
              const [sortBy, sortOrder] = event.target.value.split(":") as [
                StockFilters["sortBy"],
                StockFilters["sortOrder"],
              ];
              setDraftFilters({ ...draftFilters, sortBy, sortOrder });
            }}
            value={`${draftFilters.sortBy}:${draftFilters.sortOrder}`}
          >
            <option value="createdAt:desc">Recently updated</option>
            <option value="createdAt:asc">Oldest updated</option>
            <option value="quantity:asc">Quantity: low to high</option>
            <option value="quantity:desc">Quantity: high to low</option>
          </select>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-4">
          <Button type="submit">Apply filters</Button>
          <Button onClick={resetFilters} type="button" variant="secondary">
            Reset
          </Button>
          <p className="ml-auto self-center text-sm text-slate-500">
            {state.result.pagination.total.toLocaleString()} stock records
          </p>
        </div>
      </form>

      <DataTable
        columns={stockColumns}
        emptyMessage="No stock records match these filters."
        rowKey={(stock) => stock.id}
        rows={state.result.stock}
      />
      {state.result.pagination.total > 0 && (
        <CatalogPagination
          onPageChange={(nextPage) => {
            setPage(nextPage);
            setState({ status: "loading" });
          }}
          pagination={state.result.pagination}
        />
      )}

      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Recent transfers
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Successful transfers created in this session. The API completes transfers immediately and does not provide a historical transfer-list endpoint.
          </p>
        </div>
        <DataTable
          columns={transferColumns}
          emptyMessage="Transfers completed during this session will appear here."
          rowKey={(transfer) => transfer.transferId}
          rows={recentTransfers}
        />
      </section>

      <Modal
        onClose={() => setAdjustmentOpen(false)}
        open={adjustmentOpen}
        title="Adjust stock"
      >
        <StockAdjustmentForm
          branches={state.branches}
          key={user?.id ?? "stock-adjustment"}
          onCancel={() => setAdjustmentOpen(false)}
          onSave={applyAdjustment}
          ownBranchId={ownBranchId}
          products={state.products}
        />
      </Modal>

      <Modal
        onClose={() => setTransferOpen(false)}
        open={transferOpen}
        title="Transfer stock"
      >
        <StockTransferForm
          branches={state.branches}
          key={user?.id ?? "stock-transfer"}
          onCancel={() => setTransferOpen(false)}
          onSave={completeTransfer}
          ownBranchId={ownBranchId}
          products={state.products}
        />
      </Modal>
    </div>
  );
}
