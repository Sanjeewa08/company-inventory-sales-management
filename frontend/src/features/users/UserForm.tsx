import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { getApiErrorMessage } from "../../lib/api";
import { userRoles } from "../../types/auth";
import type { UserRole } from "../../types/auth";
import type {
  CreateUserInput,
  ManagedUser,
  UpdateUserInput,
} from "./usersApi";
import { userFormSchema, type UserFormValues } from "./userSchemas";

interface BranchChoice {
  id: string;
  name: string;
}

interface UserFormProps {
  user: ManagedUser | null;
  branches: BranchChoice[];
  onCreate: (input: CreateUserInput) => Promise<void>;
  onUpdate: (id: string, input: UpdateUserInput) => Promise<void>;
  onCancel: () => void;
}

const roleLabels: Record<UserRole, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  STOREKEEPER: "Storekeeper",
  SALES: "Sales",
  ACCOUNTANT: "Accountant",
};

function formSchemaFor(isCreating: boolean) {
  return userFormSchema.superRefine((values, context) => {
    if (isCreating && values.password.length < 8) {
      context.addIssue({
        code: "custom",
        message: "Password must be at least 8 characters",
        path: ["password"],
      });
    }
  });
}

export function UserForm({
  user,
  branches,
  onCreate,
  onUpdate,
  onCancel,
}: UserFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const isCreating = user === null;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(formSchemaFor(isCreating)),
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      password: "",
      role: user?.role ?? "SALES",
      branchId: user?.branchId ?? "",
    },
  });

  const selectClass =
    "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

  const submit = async (values: UserFormValues) => {
    setFormError(null);
    try {
      if (user) {
        await onUpdate(user.id, {
          name: values.name.trim(),
          email: values.email.trim().toLowerCase(),
          role: values.role,
          branchId: values.branchId || null,
        });
      } else {
        await onCreate({
          name: values.name.trim(),
          email: values.email.trim().toLowerCase(),
          password: values.password,
          role: values.role,
          branchId: values.branchId || null,
        });
      }
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Unable to save this user."));
    }
  };

  const assignedBranchAvailable =
    !user?.branchId || branches.some((branch) => branch.id === user.branchId);

  return (
    <form
      className="max-h-[75vh] space-y-4 overflow-y-auto pr-1"
      onSubmit={handleSubmit(submit)}
    >
      {formError && (
        <p
          className="rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700"
          role="alert"
        >
          {formError}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          autoComplete="name"
          error={errors.name?.message}
          label="Name"
          {...register("name")}
        />
        <Input
          autoComplete="email"
          error={errors.email?.message}
          label="Email"
          type="email"
          {...register("email")}
        />
        {isCreating && (
          <div className="sm:col-span-2">
            <Input
              autoComplete="new-password"
              error={errors.password?.message}
              hint="The API only supports setting a password when creating a user."
              label="Initial password"
              type="password"
              {...register("password")}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="user-role"
          >
            Role
          </label>
          <select
            className={selectClass}
            id="user-role"
            {...register("role")}
          >
            {userRoles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="user-branch"
          >
            Branch
          </label>
          <select
            className={selectClass}
            id="user-branch"
            {...register("branchId")}
          >
            <option value="">No branch assigned</option>
            {!assignedBranchAvailable && user?.branchId && (
              <option value={user.branchId}>
                Unavailable branch ({user.branchId})
              </option>
            )}
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            Only active branches can be newly assigned.
          </p>
          {errors.branchId && (
            <p className="text-xs text-rose-600" role="alert">
              {errors.branchId.message}
            </p>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button onClick={onCancel} type="button" variant="secondary">
          Cancel
        </Button>
        <Button loading={isSubmitting} type="submit">
          {user ? "Save changes" : "Create user"}
        </Button>
      </div>
    </form>
  );
}
