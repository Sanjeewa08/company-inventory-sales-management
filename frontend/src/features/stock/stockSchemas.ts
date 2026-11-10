import { z } from "zod";

const uuid = z.string().uuid("Choose a valid option");

export const stockAdjustmentSchema = z.object({
  branchId: uuid,
  productId: uuid,
  direction: z.enum(["INCREASE", "DECREASE"]),
  quantity: z
    .number()
    .int("Enter a whole number")
    .min(1, "Quantity must be at least 1")
    .max(2_147_483_647, "Quantity is too large"),
  notes: z
    .string()
    .trim()
    .min(1, "A reason is required")
    .max(1000, "Reason must be 1000 characters or fewer"),
});

export type StockAdjustmentFormValues = z.infer<
  typeof stockAdjustmentSchema
>;

const transferItemSchema = z.object({
  productId: uuid,
  quantity: z
    .number()
    .int("Enter a whole number")
    .min(1, "Quantity must be at least 1")
    .max(2_147_483_647, "Quantity is too large"),
});

export const stockTransferSchema = z
  .object({
    fromBranchId: uuid,
    toBranchId: uuid,
    notes: z.string().trim().max(1000).optional(),
    items: z.array(transferItemSchema).min(1).max(100),
  })
  .refine((value) => value.fromBranchId !== value.toBranchId, {
    message: "Source and destination branches must differ",
    path: ["toBranchId"],
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

export type StockTransferFormValues = z.infer<typeof stockTransferSchema>;
