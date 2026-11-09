import { z } from "zod";

const userRoleSchema = z.enum([
  "ADMIN",
  "MANAGER",
  "STOREKEEPER",
  "SALES",
  "ACCOUNTANT",
]);

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z
    .string()
    .trim()
    .email()
    .transform((email) => email.toLowerCase()),
  password: z.string().min(8),
  role: userRoleSchema,
  branchId: z.string().uuid().nullable().optional(),
});

export const userIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z
      .string()
      .trim()
      .email()
      .transform((email) => email.toLowerCase())
      .optional(),
    role: userRoleSchema.optional(),
    branchId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const optionalBoolean = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().min(1).optional(),
  role: userRoleSchema.optional(),
  branchId: z.string().uuid().optional(),
  isActive: optionalBoolean.optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
