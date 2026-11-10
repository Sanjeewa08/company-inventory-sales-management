import { z } from "zod";

export const listStockQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  branchId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  search: z.string().trim().min(1).optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"]).optional(),
  sortBy: z.enum(["quantity", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const adjustStockSchema = z.object({
  branchId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z
    .number()
    .int()
    .min(-2_147_483_647)
    .max(2_147_483_647)
    .refine((quantity) => quantity !== 0, {
      message: "Adjustment quantity cannot be zero",
    }),
  notes: z.string().trim().min(1, "A reason is required").max(1000),
});

const transferItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(2_147_483_647),
});

export const transferStockSchema = z
  .object({
    fromBranchId: z.string().uuid(),
    toBranchId: z.string().uuid(),
    notes: z.string().trim().max(1000).nullable().optional(),
    items: z.array(transferItemSchema).min(1).max(100),
  })
  .refine((transfer) => transfer.fromBranchId !== transfer.toBranchId, {
    message: "Source and destination branches must differ",
    path: ["toBranchId"],
  })
  .refine(
    (transfer) =>
      new Set(transfer.items.map((item) => item.productId)).size ===
      transfer.items.length,
    {
      message: "Each product may only appear once",
      path: ["items"],
    },
  );

export type ListStockQuery = z.infer<typeof listStockQuerySchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type TransferStockInput = z.infer<typeof transferStockSchema>;
