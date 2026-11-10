import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { getApiErrorMessage } from "../../lib/api";
import { formatMoney, parseMoneyCents } from "./salesFormat";
import type { PaymentInput } from "./salesApi";
import {
  paymentFormSchema,
  type PaymentFormValues,
} from "./salesSchemas";

interface PaymentFormProps {
  balance: string;
  onSave: (input: PaymentInput) => Promise<void>;
  onCancel: () => void;
}

export function PaymentForm({
  balance,
  onSave,
  onCancel,
}: PaymentFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amount: "",
      method: "CASH",
      reference: "",
      notes: "",
    },
  });

  const submit = async (values: PaymentFormValues) => {
    setFormError(null);
    if (parseMoneyCents(values.amount.trim()) > parseMoneyCents(balance)) {
      setFormError("Payment cannot exceed the outstanding balance.");
      return;
    }
    try {
      await onSave({
        amount: values.amount.trim(),
        method: values.method,
        reference: values.reference.trim() || null,
        notes: values.notes.trim() || null,
      });
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Unable to record this payment."));
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
      <p className="rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
        Outstanding balance: <strong>{formatMoney(balance)}</strong>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          error={errors.amount?.message}
          inputMode="decimal"
          label="Payment amount"
          placeholder="0.00"
          {...register("amount")}
        />
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium text-slate-700"
            htmlFor="payment-method"
          >
            Method
          </label>
          <select
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            id="payment-method"
            {...register("method")}
          >
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
          </select>
        </div>
        <Input
          error={errors.reference?.message}
          label="Reference"
          {...register("reference")}
        />
        <Input
          error={errors.notes?.message}
          label="Notes"
          {...register("notes")}
        />
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button onClick={onCancel} type="button" variant="secondary">
          Back to invoice
        </Button>
        <Button loading={isSubmitting} type="submit">
          Record payment
        </Button>
      </div>
    </form>
  );
}
