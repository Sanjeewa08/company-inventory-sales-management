import { z } from "zod";

const moneyString = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Amount must fit the database precision");

const purchaseOrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(2_147_483_647),
  unitCost: moneyString,
});

const uniqueItems = (items: Array<{ productId: string }>) =>
  new Set(items.map((item) => item.productId)).size === items.length;

export const purchaseOrderIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const createPurchaseOrderSchema = z
  .object({
    supplierId: z.string().uuid(),
    branchId: z.string().uuid(),
    expectedAt: z.coerce.date().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    tax: moneyString.default("0.00"),
    items: z.array(purchaseOrderItemSchema).min(1).max(200),
  })
  .refine((value) => uniqueItems(value.items), {
    message: "Each product may only appear once",
    path: ["items"],
  });

export const updatePurchaseOrderSchema = z
  .object({
    supplierId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    expectedAt: z.coerce.date().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    tax: moneyString.optional(),
    items: z.array(purchaseOrderItemSchema).min(1).max(200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  })
  .refine((value) => !value.items || uniqueItems(value.items), {
    message: "Each product may only appear once",
    path: ["items"],
  });

const receivePurchaseOrderItemSchema = z.object({
  purchaseOrderItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(2_147_483_647),
});

export const receivePurchaseOrderSchema = z
  .object({
    notes: z.string().trim().max(2000).nullable().optional(),
    items: z.array(receivePurchaseOrderItemSchema).min(1).max(200),
  })
  .refine(
    (value) =>
      new Set(value.items.map((item) => item.purchaseOrderItemId)).size ===
      value.items.length,
    {
      message: "Each purchase-order item may only appear once",
      path: ["items"],
    },
  );

export const listPurchaseOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
  status: z
    .enum(["DRAFT", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"])
    .optional(),
  supplierId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  sortBy: z
    .enum(["number", "orderedAt", "createdAt", "total"])
    .default("orderedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreatePurchaseOrderInput = z.infer<
  typeof createPurchaseOrderSchema
>;
export type UpdatePurchaseOrderInput = z.infer<
  typeof updatePurchaseOrderSchema
>;
export type ReceivePurchaseOrderInput = z.infer<
  typeof receivePurchaseOrderSchema
>;
export type ListPurchaseOrdersQuery = z.infer<
  typeof listPurchaseOrdersQuerySchema
>;
