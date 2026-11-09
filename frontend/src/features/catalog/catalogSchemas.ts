import { z } from "zod";

const moneyString = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter an amount with up to 2 decimals");

export const productFormSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required").max(80),
  barcode: z.string().trim().max(128).optional(),
  name: z.string().trim().min(1, "Product name is required").max(160),
  description: z.string().trim().max(2000).optional(),
  unit: z.string().trim().min(1, "Unit is required").max(40),
  categoryId: z.string().uuid("Choose a category"),
  costPrice: moneyString,
  sellingPrice: moneyString,
  reorderLevel: z.number().int().min(0, "Reorder level cannot be negative"),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(120),
  description: z.string().trim().max(1000).optional(),
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
