import { z } from "zod";

const moneyString = z
  .string()
  .regex(
    /^\d{1,10}(\.\d{1,2})?$/,
    "Price must fit the database precision and have up to two decimal places",
  );
const optionalBoolean = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const productIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const createProductSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  unit: z.string().trim().min(1).max(40).optional(),
  categoryId: z.string().uuid(),
  costPrice: moneyString,
  sellingPrice: moneyString,
  reorderLevel: z.number().int().min(0).max(2_147_483_647).default(0),
});

export const updateProductSchema = createProductSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  name: z.string().trim().min(1).optional(),
  sku: z.string().trim().min(1).optional(),
  categoryId: z.string().uuid().optional(),
  isActive: optionalBoolean.default(true),
  sortBy: z.enum(["name", "sku", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
