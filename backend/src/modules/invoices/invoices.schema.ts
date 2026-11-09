import { z } from "zod";

const moneyString = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Amount must fit the database precision");

const invoiceItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(2_147_483_647),
  unitPrice: moneyString,
});

const uniqueProducts = (items: Array<{ productId: string }>) =>
  new Set(items.map((item) => item.productId)).size === items.length;

const invoiceDates = {
  dueAt: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
};

const createInvoiceFromQuotationSchema = z
  .object({
    quotationId: z.string().uuid(),
    ...invoiceDates,
  })
  .strict();

const createInvoiceFromItemsSchema = z
  .object({
    customerId: z.string().uuid(),
    branchId: z.string().uuid(),
    ...invoiceDates,
    discount: moneyString.default("0.00"),
    tax: moneyString.default("0.00"),
    items: z.array(invoiceItemSchema).min(1).max(200),
  })
  .strict()
  .refine((value) => uniqueProducts(value.items), {
    message: "Each product may only appear once",
    path: ["items"],
  });

export const createInvoiceSchema = z.union([
  createInvoiceFromQuotationSchema,
  createInvoiceFromItemsSchema,
]);

export const invoiceIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const listInvoicesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(["PENDING", "PARTIAL", "PAID", "CANCELLED"]).optional(),
    customerId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    sortBy: z
      .enum(["number", "issuedAt", "createdAt", "total"])
      .default("issuedAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine(
    (value) =>
      value.startDate === undefined ||
      value.endDate === undefined ||
      value.startDate <= value.endDate,
    {
      message: "startDate must be on or before endDate",
      path: ["startDate"],
    },
  );

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
