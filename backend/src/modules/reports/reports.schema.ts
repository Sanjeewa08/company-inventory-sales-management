import { z } from "zod";

const dateRange = {
  from: z.coerce.date(),
  to: z.coerce.date(),
};

const validDateRange = (value: { from: Date; to: Date }) =>
  value.from <= value.to;

const dateRangeError = {
  message: "from must be on or before to",
  path: ["from"],
};

export const salesReportQuerySchema = z
  .object({
    ...dateRange,
    groupBy: z.enum(["day", "month"]).default("day"),
    branchId: z.string().uuid().optional(),
  })
  .refine(validDateRange, dateRangeError);

export const stockValuationQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
});

export const topProductsQuerySchema = z
  .object({
    ...dateRange,
    limit: z.coerce.number().int().min(1).max(100).default(10),
    branchId: z.string().uuid().optional(),
  })
  .refine(validDateRange, dateRangeError);

export const branchComparisonQuerySchema = z
  .object(dateRange)
  .refine(validDateRange, dateRangeError);

export const outstandingPaymentsQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
});

export type SalesReportQuery = z.infer<typeof salesReportQuerySchema>;
export type StockValuationQuery = z.infer<typeof stockValuationQuerySchema>;
export type TopProductsQuery = z.infer<typeof topProductsQuerySchema>;
export type BranchComparisonQuery = z.infer<typeof branchComparisonQuerySchema>;
export type OutstandingPaymentsQuery = z.infer<
  typeof outstandingPaymentsQuerySchema
>;
