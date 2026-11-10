import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { Button } from "../components/ui/Button";
import { DataTable, type DataTableColumn } from "../components/ui/DataTable";
import { ErrorState } from "../components/ui/ErrorState";
import { Input } from "../components/ui/Input";
import { Loading } from "../components/ui/Loading";
import { Modal } from "../components/ui/Modal";
import { CatalogPagination } from "../features/catalog/CatalogPagination";
import { listBranches } from "../features/stock/stockApi";
import type { BranchOption } from "../features/stock/stockApi";
import { UserForm } from "../features/users/UserForm";
import {
  createUser,
  deactivateUser,
  listUsers,
  updateUser,
  type CreateUserInput,
  type ManagedUser,
  type UpdateUserInput,
  type UserListResponse,
} from "../features/users/usersApi";
import { useAuth } from "../features/auth/useAuth";
import { getApiErrorMessage } from "../lib/api";
import type { UserRole } from "../types/auth";

type UserPageState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "loaded";
      result: UserListResponse;
      branches: BranchOption[];
    };

interface UserFilters {
  name: string;
  email: string;
  role: "" | UserRole;
  branchId: string;
  status: "" | "active" | "inactive";
}

const pageSize = 10;
const initialFilters: UserFilters = {
  name: "",
  email: "",
  role: "",
  branchId: "",
  status: "",
};

const roleLabels: Record<UserRole, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  STOREKEEPER: "Storekeeper",
  SALES: "Sales",
  ACCOUNTANT: "Accountant",
};

const userRoles: UserRole[] = [
  "ADMIN",
  "MANAGER",
  "STOREKEEPER",
  "SALES",
  "ACCOUNTANT",
];

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const canManage = currentUser?.role === "ADMIN";
  const [state, setState] = useState<UserPageState>({ status: "loading" });
  const [filters, setFilters] = useState(initialFilters);
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [reloadCount, setReloadCount] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [detailsUser, setDetailsUser] = useState<ManagedUser | null>(null);
  const [deactivationTarget, setDeactivationTarget] =
    useState<ManagedUser | null>(null);
  const [deactivationError, setDeactivationError] = useState<string | null>(
    null,
  );
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    const params = {
      page,
      limit: pageSize,
      ...(filters.name ? { name: filters.name } : {}),
      ...(filters.email ? { email: filters.email } : {}),
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(filters.status
        ? { isActive: filters.status === "active" }
        : {}),
    };
    void Promise.all([listUsers(params), listBranches()])
      .then(([result, branchResult]) => {
        if (active) {
          setState({
            status: "loaded",
            result,
            branches: branchResult.branches,
          });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message: getApiErrorMessage(error, "Unable to load users."),
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
    setFilters({
      ...draftFilters,
      name: draftFilters.name.trim(),
      email: draftFilters.email.trim(),
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
    setEditingUser(null);
    setMutationError(null);
    setFormOpen(true);
  };

  const openEditForm = (managedUser: ManagedUser) => {
    setEditingUser(managedUser);
    setMutationError(null);
    setFormOpen(true);
  };

  const saveNewUser = async (input: CreateUserInput) => {
    const created = await createUser(input);
    toast.success(`User ${created.name} created.`);
    setFormOpen(false);
    setPage(1);
    refresh();
  };

  const saveUserChanges = async (id: string, input: UpdateUserInput) => {
    const updated = await updateUser(id, input);
    toast.success(`User ${updated.name} updated.`);
    setFormOpen(false);
    refresh();
  };

  const activateUser = async (managedUser: ManagedUser) => {
    setBusyUserId(managedUser.id);
    setMutationError(null);
    try {
      await updateUser(managedUser.id, { isActive: true });
      toast.success(`${managedUser.name} activated.`);
      refresh();
    } catch (error) {
      setMutationError(
        getApiErrorMessage(error, "Unable to activate this user."),
      );
    } finally {
      setBusyUserId(null);
    }
  };

  const confirmDeactivation = async () => {
    if (!deactivationTarget) return;
    setBusyUserId(deactivationTarget.id);
    setMutationError(null);
    setDeactivationError(null);
    try {
      await deactivateUser(deactivationTarget.id);
      toast.success(`${deactivationTarget.name} deactivated.`);
      setDeactivationTarget(null);
      refresh();
    } catch (error) {
      setDeactivationError(
        getApiErrorMessage(error, "Unable to deactivate this user."),
      );
    } finally {
      setBusyUserId(null);
    }
  };

  const branchNames = useMemo(() => {
    if (state.status !== "loaded") return new Map<string, string>();
    return new Map(state.branches.map((branch) => [branch.id, branch.name]));
  }, [state]);

  if (!canManage) {
    return (
      <ErrorState
        message="Only administrators can access user management."
        title="Access restricted"
      />
    );
  }
  if (state.status === "loading") return <Loading label="Loading users" />;
  if (state.status === "error") {
    return (
      <ErrorState
        message={state.message}
        onRetry={refresh}
        title="Users unavailable"
      />
    );
  }

  const selectClass =
    "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

  const columns: DataTableColumn<ManagedUser>[] = [
    {
      key: "user",
      header: "User",
      cell: (managedUser) => (
        <div>
          <p className="font-semibold text-slate-900">{managedUser.name}</p>
          <p className="mt-1 text-xs text-slate-500">{managedUser.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      cell: (managedUser) => roleLabels[managedUser.role],
    },
    {
      key: "branch",
      header: "Branch",
      cell: (managedUser) =>
        managedUser.branchId
          ? branchNames.get(managedUser.branchId) ??
            `Unavailable (${managedUser.branchId})`
          : "Unassigned",
    },
    {
      key: "status",
      header: "Status",
      cell: (managedUser) => (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            managedUser.isActive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {managedUser.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "created",
      header: "Created",
      cell: (managedUser) => formatDate(managedUser.createdAt),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (managedUser) => (
        <div className="flex items-center gap-1">
          <Button
            className="px-2.5"
            onClick={() => setDetailsUser(managedUser)}
            type="button"
            variant="ghost"
          >
            Details
          </Button>
          <Button
            className="px-2.5"
            onClick={() => openEditForm(managedUser)}
            type="button"
            variant="ghost"
          >
            Edit
          </Button>
          {managedUser.isActive ? (
            <Button
              className="px-2.5"
              disabled={busyUserId === managedUser.id}
              onClick={() => {
                setDeactivationError(null);
                setDeactivationTarget(managedUser);
              }}
              type="button"
              variant="ghost"
            >
              Deactivate
            </Button>
          ) : (
            <Button
              className="px-2.5"
              disabled={busyUserId === managedUser.id}
              onClick={() => void activateUser(managedUser)}
              type="button"
              variant="ghost"
            >
              Activate
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
            Administration
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
            Users & access
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            Manage user accounts, roles, branch assignments, and access status.
          </p>
        </div>
        <Button onClick={openCreateForm} type="button">
          Create user
        </Button>
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
          label="Name"
          onChange={(event) =>
            setDraftFilters({ ...draftFilters, name: event.target.value })
          }
          value={draftFilters.name}
        />
        <Input
          label="Email"
          onChange={(event) =>
            setDraftFilters({ ...draftFilters, email: event.target.value })
          }
          value={draftFilters.email}
        />
        <FilterSelect
          className={selectClass}
          id="user-role-filter"
          label="Role"
          onChange={(value) =>
            setDraftFilters({
              ...draftFilters,
              role: value as UserFilters["role"],
            })
          }
          value={draftFilters.role}
        >
          <option value="">All roles</option>
          {userRoles.map((role) => (
            <option key={role} value={role}>
              {roleLabels[role]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          className={selectClass}
          id="user-branch-filter"
          label="Branch"
          onChange={(value) =>
            setDraftFilters({ ...draftFilters, branchId: value })
          }
          value={draftFilters.branchId}
        >
          <option value="">All branches</option>
          {state.branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          className={selectClass}
          id="user-status-filter"
          label="Status"
          onChange={(value) =>
            setDraftFilters({
              ...draftFilters,
              status: value as UserFilters["status"],
            })
          }
          value={draftFilters.status}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </FilterSelect>
        <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-5">
          <Button type="submit">Apply filters</Button>
          <Button onClick={resetFilters} type="button" variant="secondary">
            Reset
          </Button>
          <p className="ml-auto self-center text-sm text-slate-500">
            {state.result.pagination.total.toLocaleString()} users
          </p>
        </div>
      </form>

      <DataTable
        columns={columns}
        emptyMessage="No users match these filters."
        rowKey={(managedUser) => managedUser.id}
        rows={state.result.users}
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
        title={editingUser ? `Edit ${editingUser.name}` : "Create user"}
      >
        <UserForm
          branches={state.branches}
          key={editingUser?.id ?? "new-user"}
          onCancel={() => setFormOpen(false)}
          onCreate={saveNewUser}
          onUpdate={saveUserChanges}
          user={editingUser}
        />
      </Modal>

      <Modal
        onClose={() => setDetailsUser(null)}
        open={detailsUser !== null}
        title="User details"
      >
        {detailsUser && (
          <dl className="grid gap-4 sm:grid-cols-2">
            <UserDetail label="Name" value={detailsUser.name} />
            <UserDetail label="Email" value={detailsUser.email} />
            <UserDetail label="Role" value={roleLabels[detailsUser.role]} />
            <UserDetail
              label="Branch"
              value={
                detailsUser.branchId
                  ? branchNames.get(detailsUser.branchId) ??
                    `Unavailable (${detailsUser.branchId})`
                  : "Unassigned"
              }
            />
            <UserDetail
              label="Status"
              value={detailsUser.isActive ? "Active" : "Inactive"}
            />
            <UserDetail label="Created" value={formatDate(detailsUser.createdAt)} />
            <UserDetail
              label="Last updated"
              value={formatDate(detailsUser.updatedAt)}
            />
          </dl>
        )}
      </Modal>

      <Modal
        onClose={() => {
          setDeactivationTarget(null);
          setDeactivationError(null);
        }}
        open={deactivationTarget !== null}
        title="Deactivate user"
      >
        {deactivationTarget && (
          <div className="space-y-5">
            {deactivationError && (
              <p
                className="rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700"
                role="alert"
              >
                {deactivationError}
              </p>
            )}
            <p className="text-sm text-slate-600">
              Deactivate{" "}
              <strong className="text-slate-900">
                {deactivationTarget.name}
              </strong>
              ? They will no longer be able to sign in. You can reactivate them
              later.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                onClick={() => {
                  setDeactivationTarget(null);
                  setDeactivationError(null);
                }}
                type="button"
                variant="secondary"
              >
                Keep active
              </Button>
              <Button
                loading={busyUserId === deactivationTarget.id}
                onClick={() => void confirmDeactivation()}
                type="button"
                variant="danger"
              >
                Deactivate user
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function FilterSelect({
  className,
  id,
  label,
  value,
  onChange,
  children,
}: {
  className: string;
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
        {label}
      </label>
      <select
        className={className}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </div>
  );
}

function UserDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-900">
        {value}
      </dd>
    </div>
  );
}
