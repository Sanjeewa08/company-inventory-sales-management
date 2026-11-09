import { z } from "zod";

const moneyString = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Amount must fit the database precision");

const quotationItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(2_147_483_647),
  unitPrice: moneyString,
});

const hasUniqueProducts = (items: Array<{ productId: string }>) =>
  new Set(items.map((item) => item.productId)).size === items.length;

export const quotationIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const createQuotationSchema = z
  .object({
    customerId: z.string().uuid(),
    branchId: z.string().uuid(),
    validUntil: z.coerce.date().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    tax: moneyString.default("0.00"),
    items: z.array(quotationItemSchema).min(1).max(200),
  })
  .refine((value) => hasUniqueProducts(value.items), {
    message: "Each product may only appear once",
    path: ["items"],
  });

export const updateQuotationSchema = z
  .object({
    customerId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    validUntil: z.coerce.date().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    tax: moneyString.optional(),
    items: z.array(quotationItemSchema).min(1).max(200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  })
  .refine((value) => !value.items || hasUniqueProducts(value.items), {
    message: "Each product may only appear once",
    path: ["items"],
  });

export const listQuotationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
  status: z
    .enum(["DRAFT", "SENT", "ACCEPTED", "CONVERTED", "EXPIRED", "REJECTED"])
    .optional(),
  customerId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  sortBy: z
    .enum(["number", "issuedAt", "createdAt", "total"])
    .default("issuedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type ListQuotationsQuery = z.infer<typeof listQuotationsQuerySchema>;
