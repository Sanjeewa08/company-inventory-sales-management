import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import type { Product } from "../catalog/catalogApi";
import type { BranchOption } from "../stock/stockApi";
import { getApiErrorMessage } from "../../lib/api";
import { dateInputToIso } from "./salesFormat";
import type {
  Customer,
  Quotation,
  QuotationInput,
  QuotationUpdate,
} from "./salesApi";
import {
  quotationFormSchema,
  type QuotationFormValues,
} from "./salesSchemas";

interface QuotationFormProps {
  quotation: Quotation | null;
  customers: Customer[];
  branches: BranchOption[];
  products: Product[];
  onCreate: (input: QuotationInput) => Promise<void>;
  onUpdate: (id: string, input: QuotationUpdate) => Promise<void>;
  onCancel: () => void;
}

function sameItems(
  submitted: QuotationFormValues["items"],
  current: Quotation["items"],
): boolean {
  return (
    JSON.stringify(
      submitted.map(({ productId, quantity, unitPrice }) => ({
        productId,
        quantity,
        unitPrice,
      })),
    ) ===
    JSON.stringify(
      current.map(({ productId, quantity, unitPrice }) => ({
        productId,
        quantity,
        unitPrice,
      })),
    )
  );
}

export function QuotationForm({
  quotation,
  customers,
  branches,
  products,
  onCreate,
  onUpdate,
  onCancel,
}: QuotationFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<QuotationFormValues>({
    resolver: zodResolver(quotationFormSchema),
    defaultValues: {
      customerId: quotation?.customerId ?? "",
      branchId: quotation?.branchId ?? "",
      validUntil: quotation?.validUntil?.slice(0, 10) ?? "",
      notes: quotation?.notes ?? "",
      tax: quotation?.tax ?? "0.00",
      items: quotation
        ? quotation.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          }))
        : [{ productId: "", quantity: 1, unitPrice: "0.00" }],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const customerOptions = [
    ...customers,
    ...(quotation &&
    !customers.some((customer) => customer.id === quotation.customerId)
      ? [{ id: quotation.customerId, name: quotation.customer.name }]
      : []),
  ];
  const branchOptions = [
    ...branches,
    ...(quotation &&
    !branches.some((branch) => branch.id === quotation.branchId)
      ? [{ id: quotation.branchId, name: quotation.branch.name, isActive: false }]
      : []),
  ];
  const productOptions = [
    ...products,
    ...(quotation
      ? quotation.items
          .filter((item) => !products.some((product) => product.id === item.productId))
          .map(({ product }) => ({
            id: product.id,
            sku: product.sku,
            name: product.name,
            unit: product.unit,
            sellingPrice: "",
          }))
      : []),
  ];

  const submit = async (values: QuotationFormValues) => {
    setFormError(null);
    const items = values.items.map(({ productId, quantity, unitPrice }) => ({
      productId,
      quantity,
      unitPrice: unitPrice.trim(),
    }));
    const validUntil = dateInputToIso(values.validUntil);
    const common = {
      ...(quotation?.customerId === values.customerId
        ? {}
        : { customerId: values.customerId }),
      ...(quotation?.branchId === values.branchId
        ? {}
        : { branchId: values.branchId }),
      validUntil,
      notes: values.notes.trim() || null,
      tax: values.tax.trim(),
    };

    try {
      if (quotation) {
        await onUpdate(quotation.id, {
          ...common,
          ...(sameItems(values.items, quotation.items) ? {} : { items }),
        });
      } else {
        await onCreate({
          customerId: values.customerId,
          branchId: values.branchId,
          validUntil,
          notes: values.notes.trim() || null,
          tax: values.tax.trim(),
          items,
        });
      }
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Unable to save this quotation."));
    }
  };

  const selectClass =
    "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

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
          <label className="block text-sm font-medium text-slate-700" htmlFor="quote-customer">
            Customer
          </label>
          <select
            className={selectClass}
            id="quote-customer"
            {...register("customerId")}
          >
            <option value="">Choose customer</option>
            {customerOptions.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
          {errors.customerId && (
            <p className="text-xs text-rose-600" role="alert">
              {errors.customerId.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700" htmlFor="quote-branch">
            Branch
          </label>
          <select
            className={selectClass}
            id="quote-branch"
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
          error={errors.validUntil?.message}
          label="Valid until"
          type="date"
          {...register("validUntil")}
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
        <label className="block text-sm font-medium text-slate-700" htmlFor="quote-notes">
          Notes
        </label>
        <textarea
          className="min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
          id="quote-notes"
          {...register("notes")}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Quotation items</h3>
            <p className="text-xs text-slate-500">
              Totals are calculated by the server.
            </p>
          </div>
          <Button
            disabled={fields.length >= 200}
            onClick={() => append({ productId: "", quantity: 1, unitPrice: "0.00" })}
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
        {fields.map((field, index) => {
          const productRegistration = register(`items.${index}.productId`);
          return (
            <div
              className="grid items-end gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]"
              key={field.id}
            >
              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-slate-700"
                  htmlFor={`quote-product-${index}`}
                >
                  Product
                </label>
                <select
                  className={selectClass}
                  id={`quote-product-${index}`}
                  {...productRegistration}
                  onChange={(event) => {
                    void productRegistration.onChange(event);
                    const selected = products.find(
                      (product) => product.id === event.target.value,
                    );
                    if (selected) {
                      setValue(`items.${index}.unitPrice`, selected.sellingPrice, {
                        shouldValidate: true,
                      });
                    }
                  }}
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
                error={errors.items?.[index]?.unitPrice?.message}
                inputMode="decimal"
                label="Unit price"
                placeholder="0.00"
                {...register(`items.${index}.unitPrice`)}
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
          );
        })}
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button onClick={onCancel} type="button" variant="secondary">
          Cancel
        </Button>
        <Button loading={isSubmitting} type="submit">
          {quotation ? "Save draft" : "Create draft"}
        </Button>
      </div>
    </form>
  );
}
