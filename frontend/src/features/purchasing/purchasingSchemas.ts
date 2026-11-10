import { z } from "zod";

export const supplierFormSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required").max(160),
  contactName: z.string().trim().max(120),
  email: z.union([
    z.literal(""),
    z.string().trim().email("Enter a valid email address").max(254),
  ]),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(500),
  taxNumber: z.string().trim().max(80),
});

export type SupplierFormValues = z.infer<typeof supplierFormSchema>;

const moneyString = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter an amount with up to 2 decimals");

const purchaseOrderItemSchema = z.object({
  productId: z.string().uuid("Choose a product"),
  quantity: z
    .number()
    .int("Enter a whole quantity")
    .min(1, "Quantity must be at least 1")
    .max(2_147_483_647),
  unitCost: moneyString,
});

export const purchaseOrderFormSchema = z
  .object({
    supplierId: z.string().uuid("Choose a supplier"),
    branchId: z.string().uuid("Choose a branch"),
    expectedAt: z.string(),
    notes: z.string().trim().max(2000),
    tax: moneyString,
    items: z.array(purchaseOrderItemSchema).min(1).max(200),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      if (seen.has(item.productId)) {
        context.addIssue({
          code: "custom",
          message: "Each product may only appear once",
          path: ["items", index, "productId"],
        });
      }
      seen.add(item.productId);
    });
  });

export type PurchaseOrderFormValues = z.infer<typeof purchaseOrderFormSchema>;

const receiptItemSchema = z.object({
  purchaseOrderItemId: z.string().uuid(),
  quantity: z
    .number()
    .int("Enter a whole quantity")
    .min(0, "Quantity cannot be negative")
    .max(2_147_483_647),
});

export const receivePurchaseOrderFormSchema = z
  .object({
    notes: z.string().trim().max(2000),
    items: z.array(receiptItemSchema).min(1),
  })
  .refine((value) => value.items.some((item) => item.quantity > 0), {
    message: "Enter a quantity to receive",
    path: ["items"],
  });

export type ReceivePurchaseOrderFormValues = z.infer<
  typeof receivePurchaseOrderFormSchema
>;
