import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "../components/ui/Button";
import { DataTable, type DataTableColumn } from "../components/ui/DataTable";
import { ErrorState } from "../components/ui/ErrorState";
import { Input } from "../components/ui/Input";
import { Loading } from "../components/ui/Loading";
import { Modal } from "../components/ui/Modal";
import { CatalogPagination } from "../features/catalog/CatalogPagination";
import {
  createProduct,
  listCategories,
  listProducts,
  updateProduct,
  type Category,
  type Product,
  type ProductInput,
  type ProductListResponse,
  type ProductUpdate,
} from "../features/catalog/catalogApi";
import { ProductForm } from "../features/catalog/ProductForm";
import { useAuth } from "../features/auth/useAuth";
import { getApiErrorMessage } from "../lib/api";

type ProductPageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "loaded";
      result: ProductListResponse;
      categories: Category[];
    };

interface ProductFilters {
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  isActive: boolean;
}

const pageSize = 10;
const initialFilters: ProductFilters = {
  name: "",
  sku: "",
  barcode: "",
  categoryId: "",
  isActive: true,
};

function formatPrice(value: string): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ProductsPage() {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [state, setState] = useState<ProductPageState>({ status: "loading" });
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [reloadCount, setReloadCount] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const params = {
      page,
      limit: pageSize,
      isActive: filters.isActive,
      ...(filters.name ? { name: filters.name } : {}),
      ...(filters.sku ? { sku: filters.sku } : {}),
      ...(filters.barcode ? { barcode: filters.barcode } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    };

    void Promise.all([
      listProducts(params),
      listCategories({ page: 1, limit: 100, isActive: true }),
      listCategories({ page: 1, limit: 100, isActive: false }),
    ])
      .then(([result, activeCategories, inactiveCategories]) => {
        if (active) {
          setState({
            status: "loaded",
            result,
            categories: [...activeCategories.categories, ...inactiveCategories.categories],
          });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message: getApiErrorMessage(error, "Unable to load products."),
          });
        }
      });

    return () => {
      active = false;
    };
  }, [filters, page, reloadCount]);

  const categoryNames = useMemo(() => {
    if (state.status !== "loaded") return new Map<string, string>();
    return new Map(state.categories.map((category) => [category.id, category.name]));
  }, [state]);

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
      name: draftFilters.name.trim(),
      sku: draftFilters.sku.trim(),
      barcode: draftFilters.barcode.trim(),
    });
  };

  const resetFilters = () => {
    setDraftFilters(initialFilters);
    setFilters(initialFilters);
    setPage(1);
    setState({ status: "loading" });
    setReloadCount((count) => count + 1);
  };

  const changePage = (nextPage: number) => {
    setPage(nextPage);
    setState({ status: "loading" });
  };

  const openCreateForm = () => {
    setEditingProduct(null);
    setMutationError(null);
    setFormOpen(true);
  };

  const openEditForm = (product: Product) => {
    setEditingProduct(product);
    setMutationError(null);
    setFormOpen(true);
  };

  const saveNewProduct = async (input: ProductInput) => {
    await createProduct(input);
    setFormOpen(false);
    setPage(1);
    refresh();
  };

  const saveProductChanges = async (id: string, input: ProductUpdate) => {
    await updateProduct(id, input);
    setFormOpen(false);
    setPage(1);
    refresh();
  };

  const toggleProductStatus = async (product: Product) => {
    setMutationError(null);
    setBusyProductId(product.id);
    try {
      await updateProduct(product.id, { isActive: !product.isActive });
      setPage(1);
      refresh();
    } catch (error) {
      setMutationError(
        getApiErrorMessage(error, "Unable to update product status."),
      );
    } finally {
      setBusyProductId(null);
    }
  };

  const columns: DataTableColumn<Product>[] = [
    {
      key: "product",
      header: "Product",
      cell: (product) => (
        <div>
          <p className="font-semibold text-slate-900">{product.name}</p>
          <p className="mt-1 text-xs text-slate-500">{product.sku}</p>
        </div>
      ),
    },
    {
      key: "barcode",
      header: "Barcode",
      cell: (product) => product.barcode || "—",
    },
    {
      key: "category",
      header: "Category",
      cell: (product) => categoryNames.get(product.categoryId) ?? "Unavailable",
    },
    {
      key: "cost",
      header: "Cost",
      className: "text-right",
      cell: (product) => formatPrice(product.costPrice),
    },
    {
      key: "selling",
      header: "Selling price",
      className: "text-right",
      cell: (product) => formatPrice(product.sellingPrice),
    },
    {
      key: "reorder",
      header: "Reorder at",
      className: "text-right",
      cell: (product) => product.reorderLevel.toLocaleString(),
    },
    {
      key: "status",
      header: "Status",
      cell: (product) => (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            product.isActive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {product.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (product) => (
        <div className="flex items-center gap-1">
          <Button
            className="px-2.5"
            onClick={() => setViewingProduct(product)}
            type="button"
            variant="ghost"
          >
            Details
          </Button>
          {canManage && (
            <>
              <Button
                className="px-2.5"
                onClick={() => openEditForm(product)}
                type="button"
                variant="ghost"
              >
                Edit
              </Button>
              <Button
                className="px-2.5"
                disabled={busyProductId === product.id}
                onClick={() => void toggleProductStatus(product)}
                type="button"
                variant="ghost"
              >
                {product.isActive ? "Deactivate" : "Activate"}
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  if (state.status === "loading") {
    return <Loading label="Loading products" />;
  }
  if (state.status === "error") {
    return (
      <ErrorState message={state.message} onRetry={refresh} title="Products unavailable" />
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
            Catalog
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Products
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Search and manage the products in your catalog.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreateForm} type="button">
            Add product
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
          label="Product name"
          onChange={(event) =>
            setDraftFilters({ ...draftFilters, name: event.target.value })
          }
          value={draftFilters.name}
        />
        <Input
          label="SKU"
          onChange={(event) =>
            setDraftFilters({ ...draftFilters, sku: event.target.value })
          }
          value={draftFilters.sku}
        />
        <Input
          label="Barcode"
          onChange={(event) =>
            setDraftFilters({ ...draftFilters, barcode: event.target.value })
          }
          value={draftFilters.barcode}
        />
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="product-category-filter"
          >
            Category
          </label>
          <select
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            id="product-category-filter"
            onChange={(event) =>
              setDraftFilters({
                ...draftFilters,
                categoryId: event.target.value,
              })
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
            htmlFor="product-status-filter"
          >
            Status
          </label>
          <select
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            id="product-status-filter"
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
        <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-5">
          <Button type="submit">Search</Button>
          <Button onClick={resetFilters} type="button" variant="secondary">
            Reset
          </Button>
          <p className="ml-auto self-center text-sm text-slate-500">
            {state.result.pagination.total.toLocaleString()} products
          </p>
        </div>
      </form>

      <DataTable
        columns={columns}
        emptyMessage="No products match these filters."
        rowKey={(product) => product.id}
        rows={state.result.products}
      />
      {state.result.pagination.total > 0 && (
        <CatalogPagination
          onPageChange={changePage}
          pagination={state.result.pagination}
        />
      )}

      <Modal
        onClose={() => setFormOpen(false)}
        open={formOpen}
        title={editingProduct ? "Edit product" : "Create product"}
      >
        <ProductForm
          categories={state.categories}
          key={editingProduct?.id ?? "new-product"}
          onCancel={() => setFormOpen(false)}
          onCreate={saveNewProduct}
          onUpdate={saveProductChanges}
          product={editingProduct}
        />
      </Modal>

      <Modal
        onClose={() => setViewingProduct(null)}
        open={viewingProduct !== null}
        title="Product details"
      >
        {viewingProduct && (
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Name" value={viewingProduct.name} />
            <Detail label="SKU" value={viewingProduct.sku} />
            <Detail label="Barcode" value={viewingProduct.barcode || "—"} />
            <Detail
              label="Category"
              value={categoryNames.get(viewingProduct.categoryId) ?? "Unavailable"}
            />
            <Detail label="Unit" value={viewingProduct.unit} />
            <Detail
              label="Cost price"
              value={formatPrice(viewingProduct.costPrice)}
            />
            <Detail
              label="Selling price"
              value={formatPrice(viewingProduct.sellingPrice)}
            />
            <Detail
              label="Reorder level"
              value={viewingProduct.reorderLevel.toLocaleString()}
            />
            <Detail
              label="Status"
              value={viewingProduct.isActive ? "Active" : "Inactive"}
            />
            <Detail label="Created" value={formatDate(viewingProduct.createdAt)} />
            <div className="sm:col-span-2">
              <Detail
                label="Description"
                value={viewingProduct.description || "No description"}
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
