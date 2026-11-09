import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { getApiErrorMessage } from "../../lib/api";
import {
  categoryFormSchema,
  type CategoryFormValues,
} from "./catalogSchemas";
import type { Category, CategoryInput } from "./catalogApi";

interface CategoryFormProps {
  category: Category | null;
  onCreate: (input: CategoryInput) => Promise<void>;
  onUpdate: (id: string, input: CategoryInput) => Promise<void>;
  onCancel: () => void;
}

export function CategoryForm({
  category,
  onCreate,
  onUpdate,
  onCancel,
}: CategoryFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: category?.name ?? "",
      description: category?.description ?? "",
    },
  });

  const onSubmit = async (values: CategoryFormValues) => {
    setFormError(null);
    const input: CategoryInput = {
      name: values.name,
      description: values.description?.trim() || null,
    };

    try {
      if (category) await onUpdate(category.id, input);
      else await onCreate(input);
    } catch (error) {
      setFormError(
        getApiErrorMessage(error, "Unable to save this category."),
      );
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      {formError && (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700" role="alert">
          {formError}
        </p>
      )}
      <Input
        autoComplete="off"
        error={errors.name?.message}
        label="Category name"
        {...register("name")}
      />
      <div className="space-y-1.5">
        <label
          className="block text-sm font-medium text-slate-700"
          htmlFor="category-description"
        >
          Description
        </label>
        <textarea
          className={`min-h-24 w-full rounded-xl border bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 ${errors.description ? "border-rose-300" : "border-slate-200"}`}
          id="category-description"
          {...register("description")}
        />
        {errors.description && (
          <p className="text-xs text-rose-600" role="alert">
            {errors.description.message}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button onClick={onCancel} type="button" variant="secondary">
          Cancel
        </Button>
        <Button loading={isSubmitting} type="submit">
          {category ? "Save changes" : "Create category"}
        </Button>
      </div>
    </form>
  );
}
