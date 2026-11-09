import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();
const optionalBoolean = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const supplierIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contactName: optionalText(120),
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase())
    .nullable()
    .optional(),
  phone: optionalText(40),
  address: optionalText(500),
  taxNumber: optionalText(80),
});

export const updateSupplierSchema = createSupplierSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const listSuppliersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
  isActive: optionalBoolean.default(true),
  sortBy: z.enum(["name", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
