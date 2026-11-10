import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { getApiErrorMessage } from "../../lib/api";
import type { Product } from "../catalog/catalogApi";
import type { BranchOption } from "./stockApi";
import {
  stockAdjustmentSchema,
  type StockAdjustmentFormValues,
} from "./stockSchemas";

interface StockAdjustmentFormProps {
  branches: BranchOption[];
  products: Product[];
  ownBranchId: string | null;
  onSave: (values: StockAdjustmentFormValues) => Promise<void>;
  onCancel: () => void;
}

const selectClasses =
  "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

export function StockAdjustmentForm({
  branches,
  products,
  ownBranchId,
  onSave,
  onCancel,
}: StockAdjustmentFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StockAdjustmentFormValues>({
    resolver: zodResolver(stockAdjustmentSchema),
    defaultValues: {
      branchId: ownBranchId ?? "",
      productId: "",
      direction: "INCREASE",
      quantity: 1,
      notes: "",
    },
  });

  const submit = async (values: StockAdjustmentFormValues) => {
    setFormError(null);
    try {
      await onSave(values);
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Unable to adjust stock."));
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit(submit)}>
      {formError && (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700" role="alert">
          {formError}
        </p>
      )}
      {ownBranchId ? (
        <>
          <input type="hidden" {...register("branchId")} />
          <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
            Adjusting stock in{" "}
            <span className="font-semibold text-slate-900">
              {branches.find((branch) => branch.id === ownBranchId)?.name ??
                "your assigned branch"}
            </span>
          </p>
        </>
      ) : (
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="adjustment-branch"
          >
            Branch
          </label>
          <select
            className={selectClasses}
            id="adjustment-branch"
            {...register("branchId")}
          >
            <option value="">Select a branch</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          {errors.branchId && (
            <p className="text-xs text-rose-600" role="alert">
              {errors.branchId.message}
            </p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <label
          className="block text-sm font-medium text-slate-700"
          htmlFor="adjustment-product"
        >
          Product
        </label>
        <select
          className={selectClasses}
          id="adjustment-product"
          {...register("productId")}
        >
          <option value="">Select a product</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} · {product.sku}
            </option>
          ))}
        </select>
        {errors.productId && (
          <p className="text-xs text-rose-600" role="alert">
            {errors.productId.message}
          </p>
        )}
        {products.length === 0 && (
          <p className="text-xs text-amber-700">No active products are available.</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="adjustment-direction"
          >
            Adjustment
          </label>
          <select
            className={selectClasses}
            id="adjustment-direction"
            {...register("direction")}
          >
            <option value="INCREASE">Increase stock</option>
            <option value="DECREASE">Decrease stock</option>
          </select>
        </div>
        <Input
          error={errors.quantity?.message}
          label="Quantity"
          min={1}
          step={1}
          type="number"
          {...register("quantity", { valueAsNumber: true })}
        />
      </div>

      <Input
        error={errors.notes?.message}
        hint="Explain why this stock adjustment is needed."
        label="Reason"
        {...register("notes")}
      />

      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button onClick={onCancel} type="button" variant="secondary">
          Cancel
        </Button>
        <Button
          disabled={branches.length === 0 || products.length === 0}
          loading={isSubmitting}
          type="submit"
        >
          Apply adjustment
        </Button>
      </div>
    </form>
  );
}
