import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import type { Product } from "../catalog/catalogApi";
import type { BranchOption } from "../stock/stockApi";
import { getApiErrorMessage } from "../../lib/api";
import { dateInputToIso, formatMoney } from "./salesFormat";
import type {
  CreateInvoiceInput,
  Customer,
  Quotation,
} from "./salesApi";
import { invoiceFormSchema, type InvoiceFormValues } from "./salesSchemas";

interface InvoiceFormProps {
  customers: Customer[];
  branches: BranchOption[];
  products: Product[];
  acceptedQuotations: Quotation[];
  initialQuotationId: string | null;
  onSave: (input: CreateInvoiceInput) => Promise<void>;
  onCancel: () => void;
}

export function InvoiceForm({
  customers,
  branches,
  products,
  acceptedQuotations,
  initialQuotationId,
  onSave,
  onCancel,
}: InvoiceFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const initialQuotation = acceptedQuotations.find(
    (quotation) => quotation.id === initialQuotationId,
  );
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      source: initialQuotationId ? "quotation" : "items",
      quotationId: initialQuotationId ?? "",
      customerId: "",
      branchId: "",
      dueAt: "",
      notes: initialQuotation?.notes ?? "",
      discount: "0.00",
      tax: "0.00",
      items: [{ productId: "", quantity: 1, unitPrice: "0.00" }],
    },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });
  const source = useWatch({ control, name: "source" });

  const selectClass =
    "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100";

  const submit = async (values: InvoiceFormValues) => {
    setFormError(null);
    const dueAt = dateInputToIso(values.dueAt);
    const notes = values.notes.trim() || null;
    try {
      if (values.source === "quotation") {
        await onSave({
          quotationId: values.quotationId,
          dueAt,
          notes,
        });
      } else {
        await onSave({
          customerId: values.customerId,
          branchId: values.branchId,
          dueAt,
          notes,
          discount: values.discount.trim(),
          tax: values.tax.trim(),
          items: values.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice.trim(),
          })),
        });
      }
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Unable to create this invoice."));
    }
  };

  const quotationRegistration = register("quotationId");

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
      <div className="space-y-1.5">
        <label
          className="block text-sm font-medium text-slate-700"
          htmlFor="invoice-source"
        >
          Invoice source
        </label>
        <select
          className={selectClass}
          id="invoice-source"
          {...register("source")}
        >
          <option value="items">New invoice items</option>
          <option value="quotation">Accepted quotation</option>
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          error={errors.dueAt?.message}
          label="Due date"
          type="date"
          {...register("dueAt")}
        />
        <Input
          error={errors.notes?.message}
          label="Invoice notes"
          {...register("notes")}
        />
      </div>

      {source === "quotation" ? (
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="invoice-quotation"
          >
            Accepted quotation
          </label>
          <select
            className={selectClass}
            id="invoice-quotation"
            {...quotationRegistration}
            onChange={(event) => {
              void quotationRegistration.onChange(event);
              const selected = acceptedQuotations.find(
                (quotation) => quotation.id === event.target.value,
              );
              setValue("notes", selected?.notes ?? "");
            }}
          >
            <option value="">Choose quotation</option>
            {acceptedQuotations.map((quotation) => (
              <option key={quotation.id} value={quotation.id}>
                {quotation.number} · {quotation.customer.name} ·{" "}
                {formatMoney(quotation.total)}
              </option>
            ))}
          </select>
          {errors.quotationId && (
            <p className="text-xs text-rose-600" role="alert">
              {errors.quotationId.message}
            </p>
          )}
          {acceptedQuotations.length === 0 && (
            <p className="text-xs text-slate-500">
              There are no accepted quotations available in your permitted branches.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="invoice-customer"
              >
                Customer
              </label>
              <select
                className={selectClass}
                id="invoice-customer"
                {...register("customerId")}
              >
                <option value="">Choose customer</option>
                {customers.map((customer) => (
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
              <label
                className="block text-sm font-medium text-slate-700"
                htmlFor="invoice-branch"
              >
                Branch
              </label>
              <select
                className={selectClass}
                id="invoice-branch"
                {...register("branchId")}
              >
                <option value="">Choose branch</option>
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
            <Input
              error={errors.discount?.message}
              inputMode="decimal"
              label="Discount"
              placeholder="0.00"
              {...register("discount")}
            />
            <Input
              error={errors.tax?.message}
              inputMode="decimal"
              label="Tax"
              placeholder="0.00"
              {...register("tax")}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Invoice items</h3>
                <p className="text-xs text-slate-500">
                  Stock availability and final totals are checked by the server.
                </p>
              </div>
              <Button
                disabled={fields.length >= 200}
                onClick={() =>
                  append({ productId: "", quantity: 1, unitPrice: "0.00" })
                }
                type="button"
                variant="secondary"
              >
                Add item
              </Button>
            </div>
            {errors.items?.message && (
              <p className="text-xs text-rose-600" role="alert">
                {errors.items.message}
              </p>
            )}
            {fields.map((field, index) => {
              const productRegistration = register(
                `items.${index}.productId`,
              );
              return (
                <div
                  className="grid items-end gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]"
                  key={field.id}
                >
                  <div className="space-y-1.5">
                    <label
                      className="block text-sm font-medium text-slate-700"
                      htmlFor={`invoice-product-${index}`}
                    >
                      Product
                    </label>
                    <select
                      className={selectClass}
                      id={`invoice-product-${index}`}
                      {...productRegistration}
                      onChange={(event) => {
                        void productRegistration.onChange(event);
                        const selected = products.find(
                          (product) => product.id === event.target.value,
                        );
                        if (selected) {
                          setValue(
                            `items.${index}.unitPrice`,
                            selected.sellingPrice,
                            { shouldValidate: true },
                          );
                        }
                      }}
                    >
                      <option value="">Choose product</option>
                      {products.map((product) => (
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
                    {...register(`items.${index}.quantity`, {
                      valueAsNumber: true,
                    })}
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
        </>
      )}

      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button onClick={onCancel} type="button" variant="secondary">
          Cancel
        </Button>
        <Button loading={isSubmitting} type="submit">
          Create invoice
        </Button>
      </div>
    </form>
  );
}
