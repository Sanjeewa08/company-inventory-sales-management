import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { getApiErrorMessage } from "../../lib/api";
import type { Product } from "../catalog/catalogApi";
import type { BranchOption, TransferStockInput } from "./stockApi";
import {
  stockTransferSchema,
  type StockTransferFormValues,
} from "./stockSchemas";

interface StockTransferFormProps {
  branches: BranchOption[];
  products: Product[];
  ownBranchId: string | null;
  onSave: (input: TransferStockInput) => Promise<void>;
  onCancel: () => void;
}

const selectClasses =
  "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

export function StockTransferForm({
  branches,
  products,
  ownBranchId,
  onSave,
  onCancel,
}: StockTransferFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StockTransferFormValues>({
    resolver: zodResolver(stockTransferSchema),
    defaultValues: {
      fromBranchId: ownBranchId ?? "",
      toBranchId: "",
      notes: "",
      items: [{ productId: "", quantity: 1 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const submit = async (values: StockTransferFormValues) => {
    setFormError(null);
    try {
      await onSave({
        fromBranchId: values.fromBranchId,
        toBranchId: values.toBranchId,
        notes: values.notes?.trim() || undefined,
        items: values.items,
      });
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Unable to complete the transfer."));
    }
  };

  return (
    <form className="max-h-[75vh] space-y-4 overflow-y-auto pr-1" onSubmit={handleSubmit(submit)}>
      {formError && (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700" role="alert">
          {formError}
        </p>
      )}

      {ownBranchId ? (
        <>
          <input type="hidden" {...register("fromBranchId")} />
          <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
            Transfer source is your assigned branch:{" "}
            <span className="font-semibold text-slate-900">
              {branches.find((branch) => branch.id === ownBranchId)?.name ??
                ownBranchId}
            </span>
          </p>
        </>
      ) : (
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="transfer-source"
          >
            Source branch
          </label>
          <select
            className={selectClasses}
            id="transfer-source"
            {...register("fromBranchId")}
          >
            <option value="">Select source branch</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          {errors.fromBranchId && (
            <p className="text-xs text-rose-600" role="alert">
              {errors.fromBranchId.message}
            </p>
          )}
        </div>
      )}

      {ownBranchId ? (
        <Input
          error={errors.toBranchId?.message}
          hint="Your branch access is limited to your assigned source branch. Ask a manager for the destination branch ID."
          label="Destination branch ID"
          {...register("toBranchId")}
        />
      ) : (
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="transfer-destination"
          >
            Destination branch
          </label>
          <select
            className={selectClasses}
            id="transfer-destination"
            {...register("toBranchId")}
          >
            <option value="">Select destination branch</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          {errors.toBranchId && (
            <p className="text-xs text-rose-600" role="alert">
              {errors.toBranchId.message}
            </p>
          )}
        </div>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-800">
          Products and quantities
        </legend>
        {fields.map((field, index) => (
          <div
            className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_9rem_auto]"
            key={field.id}
          >
            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor={`transfer-product-${index}`}
              >
                Product
              </label>
              <select
                className={selectClasses}
                id={`transfer-product-${index}`}
                {...register(`items.${index}.productId`)}
              >
                <option value="">Select a product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {product.sku}
                  </option>
                ))}
              </select>
              {errors.items?.[index]?.productId && (
                <p className="text-xs text-rose-600" role="alert">
                  {errors.items[index]?.productId?.message}
                </p>
              )}
            </div>
            <Input
              error={errors.items?.[index]?.quantity?.message}
              label="Quantity"
              min={1}
              step={1}
              type="number"
              {...register(`items.${index}.quantity`, { valueAsNumber: true })}
            />
            <div className="flex items-end">
              <Button
                aria-label={`Remove product ${index + 1}`}
                className="px-3"
                disabled={fields.length === 1}
                onClick={() => remove(index)}
                type="button"
                variant="ghost"
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        <Button
          className="px-3"
          disabled={fields.length >= 100 || products.length === 0}
          onClick={() => append({ productId: "", quantity: 1 })}
          type="button"
          variant="secondary"
        >
          Add product
        </Button>
        {products.length === 0 && (
          <p className="text-xs text-amber-700">No active products are available.</p>
        )}
      </fieldset>

      <Input
        label="Transfer notes"
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
          Complete transfer
        </Button>
      </div>
    </form>
  );
}
