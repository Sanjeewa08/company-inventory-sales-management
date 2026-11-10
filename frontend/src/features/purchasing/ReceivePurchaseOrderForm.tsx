import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { getApiErrorMessage } from "../../lib/api";
import type {
  PurchaseOrder,
  ReceivePurchaseOrderInput,
} from "./purchasingApi";
import {
  receivePurchaseOrderFormSchema,
  type ReceivePurchaseOrderFormValues,
} from "./purchasingSchemas";

interface ReceivePurchaseOrderFormProps {
  order: PurchaseOrder;
  onSave: (input: ReceivePurchaseOrderInput) => Promise<void>;
  onCancel: () => void;
}

export function ReceivePurchaseOrderForm({
  order,
  onSave,
  onCancel,
}: ReceivePurchaseOrderFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const availableItems = order.items
    .map((item) => ({
      item,
      remaining: item.quantity - item.receivedQuantity,
    }))
    .filter(({ remaining }) => remaining > 0);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ReceivePurchaseOrderFormValues>({
    resolver: zodResolver(receivePurchaseOrderFormSchema),
    defaultValues: {
      notes: "",
      items: availableItems.map(({ item }) => ({
        purchaseOrderItemId: item.id,
        quantity: 0,
      })),
    },
  });
  const { fields } = useFieldArray({ control, name: "items" });

  const submit = async (values: ReceivePurchaseOrderFormValues) => {
    setFormError(null);
    const remainingById = new Map(
      availableItems.map(({ item, remaining }) => [item.id, remaining]),
    );
    const overReceived = values.items.find(
      (item) => item.quantity > (remainingById.get(item.purchaseOrderItemId) ?? 0),
    );
    if (overReceived) {
      setFormError("Received quantity cannot exceed the remaining ordered quantity.");
      return;
    }

    const items = values.items.filter((item) => item.quantity > 0);
    const input: ReceivePurchaseOrderInput = {
      items,
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    };
    try {
      await onSave(input);
    } catch (error) {
      setFormError(
        getApiErrorMessage(error, "Unable to receive this purchase order."),
      );
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit(submit)}>
      {formError && (
        <p
          className="rounded-xl border border-rose-100 bg-rose-50 px-3.5 py-3 text-sm text-rose-700"
          role="alert"
        >
          {formError}
        </p>
      )}
      {availableItems.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          All ordered quantities have already been received.
        </p>
      ) : (
        <div className="max-h-[48vh] space-y-3 overflow-y-auto">
          {fields.map((field, index) => {
            const { item, remaining } = availableItems[index];
            return (
              <div
                className="grid items-end gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,2fr)_1fr]"
                key={field.id}
              >
                <div>
                  <p className="font-medium text-slate-900">{item.product.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.product.sku} · {item.receivedQuantity} of {item.quantity}{" "}
                    received · {remaining} remaining
                  </p>
                </div>
                <Input
                  label="Receive quantity"
                  min={0}
                  max={remaining}
                  step={1}
                  type="number"
                  error={errors.items?.[index]?.quantity?.message}
                  {...register(`items.${index}.quantity`, {
                    valueAsNumber: true,
                  })}
                />
              </div>
            );
          })}
        </div>
      )}
      {errors.items?.message && (
        <p className="text-xs text-rose-600" role="alert">
          {errors.items.message}
        </p>
      )}
      {availableItems.length > 0 && (
        <Input
          error={errors.notes?.message}
          label="Receipt notes"
          {...register("notes")}
        />
      )}
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button onClick={onCancel} type="button" variant="secondary">
          Close
        </Button>
        {availableItems.length > 0 && (
          <Button loading={isSubmitting} type="submit">
            Record receipt
          </Button>
        )}
      </div>
    </form>
  );
}
