import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import type { Product } from "../catalog/catalogApi";
import type { BranchOption } from "../stock/stockApi";
import { getApiErrorMessage } from "../../lib/api";
import type {
  PurchaseOrder,
  PurchaseOrderInput,
  PurchaseOrderUpdate,
  Supplier,
} from "./purchasingApi";
import {
  purchaseOrderFormSchema,
  type PurchaseOrderFormValues,
} from "./purchasingSchemas";

interface PurchaseOrderFormProps {
  order: PurchaseOrder | null;
  suppliers: Supplier[];
  branches: BranchOption[];
  products: Product[];
  onCreate: (input: PurchaseOrderInput) => Promise<void>;
  onUpdate: (id: string, input: PurchaseOrderUpdate) => Promise<void>;
  onCancel: () => void;
}

type ProductChoice = Pick<Product, "id" | "sku" | "name" | "unit">;

function isSameOrderItems(
  submitted: PurchaseOrderFormValues["items"],
  current: PurchaseOrder["items"],
): boolean {
  return (
    JSON.stringify(
      submitted.map(({ productId, quantity, unitCost }) => ({
        productId,
        quantity,
        unitCost,
      })),
    ) ===
    JSON.stringify(
      current.map(({ productId, quantity, unitCost }) => ({
        productId,
        quantity,
        unitCost,
      })),
    )
  );
}

export function PurchaseOrderForm({
  order,
  suppliers,
  branches,
  products,
  onCreate,
  onUpdate,
  onCancel,
}: PurchaseOrderFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(purchaseOrderFormSchema),
    defaultValues: {
      supplierId: order?.supplierId ?? "",
      branchId: order?.branchId ?? "",
      expectedAt: order?.expectedAt?.slice(0, 10) ?? "",
      notes: order?.notes ?? "",
      tax: order?.tax ?? "0.00",
      items: order
        ? order.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
          }))
        : [{ productId: "", quantity: 1, unitCost: "0.00" }],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const supplierOptions = [
    ...suppliers,
    ...(order && !suppliers.some((supplier) => supplier.id === order.supplierId)
      ? [{ id: order.supplierId, name: order.supplier.name }]
      : []),
  ];
  const branchOptions = [
    ...branches,
    ...(order && !branches.some((branch) => branch.id === order.branchId)
      ? [{ id: order.branchId, name: order.branch.name, isActive: false }]
      : []),
  ];
  const productOptions: ProductChoice[] = [
    ...products,
    ...(order
      ? order.items
          .filter((item) => !products.some((product) => product.id === item.productId))
          .map(({ product }) => ({
            id: product.id,
            sku: product.sku,
            name: product.name,
            unit: product.unit,
          }))
      : []),
  ];

  const submit = async (values: PurchaseOrderFormValues) => {
    setFormError(null);
    const expectedAt = values.expectedAt
      ? new Date(`${values.expectedAt}T00:00:00.000Z`).toISOString()
      : null;
    const items = values.items.map(({ productId, quantity, unitCost }) => ({
      productId,
      quantity,
      unitCost: unitCost.trim(),
    }));
    const common = {
      ...(order?.supplierId === values.supplierId
        ? {}
        : { supplierId: values.supplierId }),
      ...(order?.branchId === values.branchId
        ? {}
        : { branchId: values.branchId }),
      expectedAt,
      notes: values.notes.trim() || null,
      tax: values.tax.trim(),
    };

    try {
      if (order) {
        await onUpdate(order.id, {
          ...common,
          ...(isSameOrderItems(values.items, order.items) ? {} : { items }),
        });
      } else {
        await onCreate({
          supplierId: values.supplierId,
          branchId: values.branchId,
          expectedAt,
          notes: values.notes.trim() || null,
          tax: values.tax.trim(),
          items,
        });
      }
    } catch (error) {
      setFormError(
        getApiErrorMessage(error, "Unable to save this purchase order."),
      );
    }
  };

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
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="po-supplier"
          >
            Supplier
          </label>
          <select
            className={`min-h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 ${errors.supplierId ? "border-rose-300" : "border-slate-200"}`}
            id="po-supplier"
            {...register("supplierId")}
          >
            <option value="">Choose supplier</option>
            {supplierOptions.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
          {errors.supplierId && (
            <p className="text-xs text-rose-600" role="alert">
              {errors.supplierId.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="po-branch"
          >
            Branch
          </label>
          <select
            className={`min-h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 ${errors.branchId ? "border-rose-300" : "border-slate-200"}`}
            id="po-branch"
            {...register("branchId")}
          >
            <option value="">Choose branch</option>
            {branchOptions.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
                {!branch.isActive ? " (inactive)" : ""}
              </option>
            ))}
          </select>
          {errors.branchId && (
            <p className="text-xs text-rose-600" role="alert">
              {errors.branchId.message}
            </p>
          )}
        </div>
        <Input
          error={errors.expectedAt?.message}
          label="Expected delivery"
          type="date"
          {...register("expectedAt")}
        />
        <Input
          error={errors.tax?.message}
          inputMode="decimal"
          label="Tax amount"
          placeholder="0.00"
          {...register("tax")}
        />
      </div>
      <div className="space-y-1.5">
        <label
          className="block text-sm font-medium text-slate-700"
          htmlFor="po-notes"
        >
          Notes
        </label>
        <textarea
          className={`min-h-20 w-full rounded-xl border bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 ${errors.notes ? "border-rose-300" : "border-slate-200"}`}
          id="po-notes"
          {...register("notes")}
        />
        {errors.notes && (
          <p className="text-xs text-rose-600" role="alert">
            {errors.notes.message}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Order items</h3>
            <p className="text-xs text-slate-500">
              Final subtotal and total are calculated by the server.
            </p>
          </div>
          <Button
            disabled={fields.length >= 200}
            onClick={() => append({ productId: "", quantity: 1, unitCost: "0.00" })}
            type="button"
            variant="secondary"
          >
            Add item
          </Button>
        </div>
        {errors.items?.root?.message && (
          <p className="text-xs text-rose-600" role="alert">
            {errors.items.root.message}
          </p>
        )}
        {fields.map((field, index) => (
          <div
            className="grid items-end gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]"
            key={field.id}
          >
            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor={`po-item-${index}`}
              >
                Product
              </label>
              <select
                className={`min-h-11 w-full rounded-xl border bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 ${errors.items?.[index]?.productId ? "border-rose-300" : "border-slate-200"}`}
                id={`po-item-${index}`}
                {...register(`items.${index}.productId`)}
              >
                <option value="">Choose product</option>
                {productOptions.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.sku})
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
            <Input
              error={errors.items?.[index]?.unitCost?.message}
              inputMode="decimal"
              label="Unit cost"
              placeholder="0.00"
              {...register(`items.${index}.unitCost`)}
            />
            <Button
              aria-label={`Remove item ${index + 1}`}
              className="mb-0.5"
              disabled={fields.length <= 1}
              onClick={() => remove(index)}
              type="button"
              variant="ghost"
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button onClick={onCancel} type="button" variant="secondary">
          Cancel
        </Button>
        <Button loading={isSubmitting} type="submit">
          {order ? "Save draft" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}
