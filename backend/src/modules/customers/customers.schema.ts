import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();

export const customerIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(160),
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

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const optionalBoolean = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
  isActive: optionalBoolean.default(true),
  sortBy: z.enum(["name", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
