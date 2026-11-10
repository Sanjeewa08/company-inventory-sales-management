import { z } from "zod";

export const customerFormSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required").max(160),
  email: z.union([
    z.literal(""),
    z.string().trim().email("Enter a valid email address"),
  ]),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(500),
  taxNumber: z.string().trim().max(80),
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;

const moneyString = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter an amount with up to 2 decimals");
const nonNegativeInteger = z
  .number()
  .int("Enter a whole quantity")
  .min(1, "Quantity must be at least 1")
  .max(2_147_483_647);

const salesItemSchema = z.object({
  productId: z.string().uuid("Choose a product"),
  quantity: nonNegativeInteger,
  unitPrice: moneyString,
});

function uniqueProducts(
  items: Array<{ productId: string }>,
  context: z.RefinementCtx,
) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.productId)) {
      context.addIssue({
        code: "custom",
        message: "Each product may only appear once",
        path: ["items", index, "productId"],
      });
    }
    seen.add(item.productId);
  });
}

export const quotationFormSchema = z
  .object({
    customerId: z.string().uuid("Choose a customer"),
    branchId: z.string().uuid("Choose a branch"),
    validUntil: z.string(),
    notes: z.string().trim().max(2000),
    tax: moneyString,
    items: z.array(salesItemSchema).min(1).max(200),
  })
  .superRefine((value, context) => uniqueProducts(value.items, context));

export type QuotationFormValues = z.infer<typeof quotationFormSchema>;

const invoiceItemSchema = z.object({
  productId: z.string(),
  quantity: z.number(),
  unitPrice: z.string(),
});

export const invoiceFormSchema = z
  .object({
    source: z.enum(["items", "quotation"]),
    quotationId: z.string(),
    customerId: z.string(),
    branchId: z.string(),
    dueAt: z.string(),
    notes: z.string().trim().max(2000),
    discount: z.string(),
    tax: z.string(),
    items: z.array(invoiceItemSchema),
  })
  .superRefine((value, context) => {
    if (value.source === "quotation") {
      if (!z.string().uuid().safeParse(value.quotationId).success) {
        context.addIssue({
          code: "custom",
          message: "Choose an accepted quotation",
          path: ["quotationId"],
        });
      }
      return;
    }
    if (!z.string().uuid().safeParse(value.customerId).success) {
      context.addIssue({
        code: "custom",
        message: "Choose a customer",
        path: ["customerId"],
      });
    }
    if (!z.string().uuid().safeParse(value.branchId).success) {
      context.addIssue({
        code: "custom",
        message: "Choose a branch",
        path: ["branchId"],
      });
    }
    if (value.items.length < 1 || value.items.length > 200) {
      context.addIssue({
        code: "custom",
        message: "Add between 1 and 200 items",
        path: ["items"],
      });
      return;
    }
    value.items.forEach((item, index) => {
      if (!z.string().uuid().safeParse(item.productId).success) {
        context.addIssue({
          code: "custom",
          message: "Choose a product",
          path: ["items", index, "productId"],
        });
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        context.addIssue({
          code: "custom",
          message: "Quantity must be a positive whole number",
          path: ["items", index, "quantity"],
        });
      }
      if (!moneyString.safeParse(item.unitPrice).success) {
        context.addIssue({
          code: "custom",
          message: "Enter an amount with up to 2 decimals",
          path: ["items", index, "unitPrice"],
        });
      }
    });
    uniqueProducts(value.items, context);
    if (!moneyString.safeParse(value.discount).success) {
      context.addIssue({
        code: "custom",
        message: "Enter an amount with up to 2 decimals",
        path: ["discount"],
      });
    }
    if (!moneyString.safeParse(value.tax).success) {
      context.addIssue({
        code: "custom",
        message: "Enter an amount with up to 2 decimals",
        path: ["tax"],
      });
    }
  });

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

export const paymentFormSchema = z.object({
  amount: moneyString.refine(
    (value) => !/^0+(?:\.0+)?$/.test(value),
    "Payment must be greater than zero",
  ),
  method: z.enum(["CASH", "CARD", "BANK_TRANSFER"]),
  reference: z.string().trim().max(120),
  notes: z.string().trim().max(2000),
});

export type PaymentFormValues = z.infer<typeof paymentFormSchema>;
