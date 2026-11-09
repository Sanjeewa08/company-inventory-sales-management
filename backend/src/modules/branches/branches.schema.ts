import { z } from "zod";

const optionalBoolean = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const branchIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const createBranchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});

export const updateBranchSchema = createBranchSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const listBranchesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  name: z.string().trim().min(1).optional(),
  isActive: optionalBoolean.default(true),
  sortBy: z.enum(["name", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type ListBranchesQuery = z.infer<typeof listBranchesQuerySchema>;
