import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../components/ui/Button";
import { DataTable, type DataTableColumn } from "../components/ui/DataTable";
import { ErrorState } from "../components/ui/ErrorState";
import { Input } from "../components/ui/Input";
import { Loading } from "../components/ui/Loading";
import { Modal } from "../components/ui/Modal";
import { useAuth } from "../features/auth/useAuth";
import { CatalogPagination } from "../features/catalog/CatalogPagination";
import {
  createCategory,
  listCategories,
  updateCategory,
  type Category,
  type CategoryInput,
  type CategoryListResponse,
} from "../features/catalog/catalogApi";
import { CategoryForm } from "../features/catalog/CategoryForm";
import { getApiErrorMessage } from "../lib/api";

type CategoryPageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; result: CategoryListResponse };

interface CategoryFilters {
  name: string;
  isActive: boolean;
}

const pageSize = 10;

export function CategoriesPage() {
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [state, setState] = useState<CategoryPageState>({ status: "loading" });
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<CategoryFilters>({
    name: "",
    isActive: true,
  });
  const [draftFilters, setDraftFilters] = useState<CategoryFilters>({
    name: "",
    isActive: true,
  });
  const [reloadCount, setReloadCount] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listCategories({
      page,
      limit: pageSize,
      isActive: filters.isActive,
      ...(filters.name ? { name: filters.name } : {}),
    })
      .then((result) => {
        if (active) setState({ status: "loaded", result });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message: getApiErrorMessage(error, "Unable to load categories."),
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
    setFilters({ ...draftFilters, name: draftFilters.name.trim() });
  };

  const resetFilters = () => {
    const reset = { name: "", isActive: true };
    setDraftFilters(reset);
    setFilters(reset);
    setPage(1);
    setState({ status: "loading" });
    setReloadCount((count) => count + 1);
  };

  const openCreateForm = () => {
    setEditingCategory(null);
    setMutationError(null);
    setFormOpen(true);
  };

  const openEditForm = (category: Category) => {
    setEditingCategory(category);
    setMutationError(null);
    setFormOpen(true);
  };

  const saveNewCategory = async (input: CategoryInput) => {
    await createCategory(input);
    setFormOpen(false);
    setPage(1);
    refresh();
  };

  const saveCategoryChanges = async (
    id: string,
    input: CategoryInput,
  ) => {
    await updateCategory(id, input);
    setFormOpen(false);
    setPage(1);
    refresh();
  };

  const toggleCategoryStatus = async (category: Category) => {
    setMutationError(null);
    setBusyCategoryId(category.id);
    try {
      await updateCategory(category.id, { isActive: !category.isActive });
      setPage(1);
      refresh();
    } catch (error) {
      setMutationError(
        getApiErrorMessage(error, "Unable to update category status."),
      );
    } finally {
      setBusyCategoryId(null);
    }
  };

  const columns: DataTableColumn<Category>[] = [
    {
      key: "name",
      header: "Category",
      cell: (category) => (
        <span className="font-semibold text-slate-900">{category.name}</span>
      ),
    },
    {
      key: "description",
      header: "Description",
      cell: (category) => category.description || "—",
    },
    {
      key: "created",
      header: "Created",
      cell: (category) =>
        new Date(category.createdAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
    },
    {
      key: "status",
      header: "Status",
      cell: (category) => (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            category.isActive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {category.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "Actions",
            cell: (category: Category) => (
              <div className="flex items-center gap-1">
                <Button
                  className="px-2.5"
                  onClick={() => openEditForm(category)}
                  type="button"
                  variant="ghost"
                >
                  Edit
                </Button>
                <Button
                  className="px-2.5"
                  disabled={busyCategoryId === category.id}
                  onClick={() => void toggleCategoryStatus(category)}
                  type="button"
                  variant="ghost"
                >
                  {category.isActive ? "Deactivate" : "Activate"}
                </Button>
              </div>
            ),
          } satisfies DataTableColumn<Category>,
        ]
      : []),
  ];

  if (state.status === "loading") {
    return <Loading label="Loading categories" />;
  }
  if (state.status === "error") {
    return (
      <ErrorState
        message={state.message}
        onRetry={refresh}
        title="Categories unavailable"
      />
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
            Categories
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Organize products into reusable catalog categories.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreateForm} type="button">
            Add category
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
        className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end"
        onSubmit={applyFilters}
      >
        <div className="flex-1">
          <Input
            label="Category name"
            onChange={(event) =>
              setDraftFilters({ ...draftFilters, name: event.target.value })
            }
            value={draftFilters.name}
          />
        </div>
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="category-status-filter"
          >
            Status
          </label>
          <select
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            id="category-status-filter"
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
        <div className="flex gap-2">
          <Button type="submit">Search</Button>
          <Button onClick={resetFilters} type="button" variant="secondary">
            Reset
          </Button>
        </div>
      </form>

      <DataTable
        columns={columns}
        emptyMessage="No categories match these filters."
        rowKey={(category) => category.id}
        rows={state.result.categories}
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

      <Modal
        onClose={() => setFormOpen(false)}
        open={formOpen}
        title={editingCategory ? "Edit category" : "Create category"}
      >
        <CategoryForm
          category={editingCategory}
          key={editingCategory?.id ?? "new-category"}
          onCancel={() => setFormOpen(false)}
          onCreate={saveNewCategory}
          onUpdate={saveCategoryChanges}
        />
      </Modal>
    </div>
  );
}
