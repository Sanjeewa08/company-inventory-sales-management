import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { getApiErrorMessage } from "../../lib/api";
import type { Supplier, SupplierInput } from "./purchasingApi";
import {
  supplierFormSchema,
  type SupplierFormValues,
} from "./purchasingSchemas";

interface SupplierFormProps {
  supplier: Supplier | null;
  onSave: (input: SupplierInput) => Promise<void>;
  onCancel: () => void;
}

export function SupplierForm({
  supplier,
  onSave,
  onCancel,
}: SupplierFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: {
      name: supplier?.name ?? "",
      contactName: supplier?.contactName ?? "",
      email: supplier?.email ?? "",
      phone: supplier?.phone ?? "",
      address: supplier?.address ?? "",
      taxNumber: supplier?.taxNumber ?? "",
    },
  });

  const submit = async (values: SupplierFormValues) => {
    setFormError(null);
    const input: SupplierInput = {
      name: values.name.trim(),
      contactName: values.contactName.trim() || null,
      email: values.email.trim().toLowerCase() || null,
      phone: values.phone.trim() || null,
      address: values.address.trim() || null,
      taxNumber: values.taxNumber.trim() || null,
    };

    try {
      await onSave(input);
    } catch (error) {
      setFormError(getApiErrorMessage(error, "Unable to save this supplier."));
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
        <Input
          autoComplete="organization"
          error={errors.name?.message}
          label="Supplier name"
          {...register("name")}
        />
        <Input
          autoComplete="name"
          error={errors.contactName?.message}
          label="Contact name"
          {...register("contactName")}
        />
        <Input
          autoComplete="email"
          error={errors.email?.message}
          label="Email"
          type="email"
          {...register("email")}
        />
        <Input
          autoComplete="tel"
          error={errors.phone?.message}
          label="Phone"
          {...register("phone")}
        />
        <Input
          autoComplete="off"
          error={errors.taxNumber?.message}
          label="Tax number"
          {...register("taxNumber")}
        />
      </div>
      <div className="space-y-1.5">
        <label
          className="block text-sm font-medium text-slate-700"
          htmlFor="supplier-address"
        >
          Address
        </label>
        <textarea
          className={`min-h-24 w-full rounded-xl border bg-white px-3.5 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 ${errors.address ? "border-rose-300" : "border-slate-200"}`}
          id="supplier-address"
          {...register("address")}
        />
        {errors.address && (
          <p className="text-xs text-rose-600" role="alert">
            {errors.address.message}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button onClick={onCancel} type="button" variant="secondary">
          Cancel
        </Button>
        <Button loading={isSubmitting} type="submit">
          {supplier ? "Save changes" : "Create supplier"}
        </Button>
      </div>
    </form>
  );
}
