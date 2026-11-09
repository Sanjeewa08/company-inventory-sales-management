import { z } from "zod";

export const listLowStockAlertsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  branchId: z.string().uuid().optional(),
  acknowledged: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "isRead"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const alertIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type ListLowStockAlertsQuery = z.infer<
  typeof listLowStockAlertsQuerySchema
>;
