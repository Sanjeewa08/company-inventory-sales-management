import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { getApiErrorMessage } from "../../lib/api";
import {
  productFormSchema,
  type ProductFormValues,
} from "./catalogSchemas";
import type {
  Category,
  Product,
  ProductInput,
  ProductUpdate,
} from "./catalogApi";

interface ProductFormProps {
  product: Product | null;
  categories: Category[];
  onCreate: (input: ProductInput) => Promise<void>;
  onUpdate: (id: string, input: ProductUpdate) => Promise<void>;
  onCancel: () => void;
}

export function ProductForm({
  product,
  categories,
  onCreate,
  onUpdate,
  onCancel,
}: ProductFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      sku: product?.sku ?? "",
      barcode: product?.barcode ?? "",
      name: product?.name ?? "",
      description: product?.description ?? "",
      unit: product?.unit ?? "unit",
      categoryId: product?.categoryId ?? "",
      costPrice: product?.costPrice ?? "",
      sellingPrice: product?.sellingPrice ?? "",
      reorderLevel: product?.reorderLevel ?? 0,
    },
  });

  const onSubmit = async (values: ProductFormValues) => {
    setFormError(null);
    const input: ProductInput = {
      sku: values.sku,
      barcode: values.barcode?.trim() || null,
      name: values.name,
      description: values.description?.trim() || null,
      unit: values.unit,
      categoryId: values.categoryId,
      costPrice: values.costPrice,
      sellingPrice: values.sellingPrice,
      reorderLevel: values.reorderLevel,
    };

    try {
      if (product) {
        const { categoryId, ...productFields } = input;
        await onUpdate(
          product.id,
          categoryId === product.categoryId
            ? productFields
            : { ...productFields, categoryId },
        );
      } else {
        await onCreate(input);
      }
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Unable to save this product."));
    }
  };

  const formCategories = categories.filter(
    (category) => category.isActive || category.id === product?.categoryId,
  );

  return (
    <form className="max-h-[75vh] space-y-4 overflow-y-auto pr-1" onSubmit={handleSubmit(onSubmit)}>
      {formError && (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700" role="alert">
          {formError}
        </p>
      )}
      {formCategories.length === 0 && (
        <p className="rounded-xl border border-amber-100 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
          Create an active category before adding a product.{" "}
          <Link className="font-semibold underline" to="/categories">
            Manage categories
          </Link>
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          autoComplete="off"
          error={errors.name?.message}
          label="Product name"
          {...register("name")}
        />
        <Input
          autoComplete="off"
          error={errors.sku?.message}
          label="SKU"
          {...register("sku")}
        />
        <Input
          autoComplete="off"
          error={errors.barcode?.message}
          label="Barcode"
          hint="Optional; must be unique when supplied."
          {...register("barcode")}
        />
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="product-category"
          >
            Category
          </label>
          <select
            className={`min-h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 ${errors.categoryId ? "border-rose-300" : "border-slate-200"}`}
            id="product-category"
            {...register("categoryId")}
          >
            <option value="">Choose category</option>
            {formCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {!category.isActive ? " (inactive)" : ""}
              </option>
            ))}
          </select>
          {errors.categoryId && (
            <p className="text-xs text-rose-600" role="alert">
              {errors.categoryId.message}
            </p>
          )}
        </div>
        <Input
          error={errors.costPrice?.message}
          label="Cost price"
          inputMode="decimal"
          placeholder="0.00"
          {...register("costPrice")}
        />
        <Input
          error={errors.sellingPrice?.message}
          label="Selling price"
          inputMode="decimal"
          placeholder="0.00"
          {...register("sellingPrice")}
        />
        <Input
          error={errors.unit?.message}
          label="Unit"
          placeholder="unit"
          {...register("unit")}
        />
        <Input
          error={errors.reorderLevel?.message}
          label="Reorder level"
          min={0}
          step={1}
          type="number"
          {...register("reorderLevel", { valueAsNumber: true })}
        />
      </div>

      <div className="space-y-1.5">
        <label
          className="block text-sm font-medium text-slate-700"
          htmlFor="product-description"
        >
          Description
        </label>
        <textarea
          className={`min-h-24 w-full rounded-xl border bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 ${errors.description ? "border-rose-300" : "border-slate-200"}`}
          id="product-description"
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
        <Button
          disabled={formCategories.length === 0}
          loading={isSubmitting}
          type="submit"
        >
          {product ? "Save changes" : "Create product"}
        </Button>
      </div>
    </form>
  );
}
