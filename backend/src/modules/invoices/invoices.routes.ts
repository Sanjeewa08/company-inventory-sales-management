import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/validate-request";
import {
  cancelInvoiceController,
  createInvoiceController,
  createInvoicePaymentController,
  getInvoiceController,
  getInvoicePdfController,
  listInvoicePaymentsController,
  listInvoicesController,
} from "./invoices.controller";
import {
  createPaymentSchema,
  createInvoiceSchema,
  invoiceIdParamsSchema,
  listInvoicesQuerySchema,
} from "./invoices.schema";

export const invoicesRouter = Router();
invoicesRouter.use(
  authenticate,
  authorize("SALES", "MANAGER", "ADMIN", "ACCOUNTANT"),
);

/**
 * @swagger
 * /invoices:
 *   post:
 *     summary: Create an invoice from items or an accepted quotation
 *     description: Sales users are limited to their assigned branch; managers and admins may select any branch.
 *     tags: [Invoices]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required: [customerId, branchId, items]
 *                 properties:
 *                   customerId: { type: string, format: uuid }
 *                   branchId: { type: string, format: uuid }
 *                   dueAt: { type: string, format: date-time, nullable: true }
 *                   notes: { type: string, nullable: true }
 *                   discount: { type: string, description: Fixed discount amount }
 *                   tax: { type: string, description: Tax amount }
 *                   items:
 *                     type: array
 *                     items:
 *                       type: object
 *                       required: [productId, quantity, unitPrice]
 *                       properties:
 *                         productId: { type: string, format: uuid }
 *                         quantity: { type: integer, minimum: 1 }
 *                         unitPrice: { type: string }
 *               - type: object
 *                 required: [quotationId]
 *                 properties:
 *                   quotationId: { type: string, format: uuid }
 *                   dueAt: { type: string, format: date-time, nullable: true }
 *                   notes: { type: string, nullable: true }
 *     responses:
 *       201: { description: Created PENDING invoice with stock movements }
 *       400: { description: Invalid invoice, discount, or insufficient stock }
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 *       404: { description: Customer, branch, product, or quotation not found }
 *       409: { description: Quotation is not accepted or already converted }
 */
invoicesRouter.post(
  "/",
  authorize("SALES", "MANAGER", "ADMIN"),
  validateRequest({ body: createInvoiceSchema }),
  createInvoiceController,
);

/**
 * @swagger
 * /invoices:
 *   get:
 *     summary: List invoices in the caller's permitted branches
 *     tags: [Invoices]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100 } }
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, PARTIAL, PAID, CANCELLED] } }
 *       - { in: query, name: customerId, schema: { type: string, format: uuid } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: startDate, schema: { type: string, format: date-time } }
 *       - { in: query, name: endDate, schema: { type: string, format: date-time } }
 *       - { in: query, name: sortBy, schema: { type: string, enum: [number, issuedAt, createdAt, total] } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200: { description: Paginated invoices }
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 */
invoicesRouter.get(
  "/",
  validateRequest({ query: listInvoicesQuerySchema }),
  listInvoicesController,
);

/**
 * @swagger
 * /invoices/{id}/payments:
 *   post:
 *     summary: Record a payment against an invoice
 *     description: Accountants, managers, and admins may record payments; overpayment and cancelled invoices are rejected.
 *     tags: [Invoices]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, method]
 *             properties:
 *               amount: { type: string, description: Positive decimal amount }
 *               method: { type: string, enum: [CASH, CARD, BANK_TRANSFER] }
 *               reference: { type: string, nullable: true }
 *               notes: { type: string, nullable: true }
 *     responses:
 *       201: { description: Recorded payment and updated invoice status }
 *       400: { description: Invalid amount or payment exceeds balance }
 *       401: { description: Missing or invalid token }
 *       403: { description: Accountant, manager, or admin role required, or branch access forbidden }
 *       404: { description: Invoice not found }
 *       409: { description: Invoice is cancelled or already paid }
 */
invoicesRouter.post(
  "/:id/payments",
  authorize("ACCOUNTANT", "MANAGER", "ADMIN"),
  validateRequest({
    params: invoiceIdParamsSchema,
    body: createPaymentSchema,
  }),
  createInvoicePaymentController,
);

/**
 * @swagger
 * /invoices/{id}/payments:
 *   get:
 *     summary: List payments recorded for an invoice
 *     tags: [Invoices]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Invoice payments in chronological order }
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 *       404: { description: Invoice not found }
 */
invoicesRouter.get(
  "/:id/payments",
  validateRequest({ params: invoiceIdParamsSchema }),
  listInvoicePaymentsController,
);

/**
 * @swagger
 * /invoices/{id}/pdf:
 *   get:
 *     summary: Download a PDF invoice
 *     tags: [Invoices]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Invoice PDF document
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 *       404: { description: Invoice not found }
 */
invoicesRouter.get(
  "/:id/pdf",
  validateRequest({ params: invoiceIdParamsSchema }),
  getInvoicePdfController,
);

/**
 * @swagger
 * /invoices/{id}:
 *   get:
 *     summary: Get an invoice and its line items
 *     tags: [Invoices]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Invoice details }
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 *       404: { description: Invoice not found }
 */
invoicesRouter.get(
  "/:id",
  validateRequest({ params: invoiceIdParamsSchema }),
  getInvoiceController,
);

/**
 * @swagger
 * /invoices/{id}/cancel:
 *   post:
 *     summary: Cancel an unpaid invoice and restore its stock
 *     tags: [Invoices]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Cancelled invoice; stock restored with RETURN movements }
 *       401: { description: Missing or invalid token }
 *       403: { description: SALES, MANAGER, or ADMIN role required, or branch access forbidden }
 *       404: { description: Invoice not found }
 *       409: { description: Invoice has payments or cannot be cancelled }
 */
invoicesRouter.post(
  "/:id/cancel",
  authorize("SALES", "MANAGER", "ADMIN"),
  validateRequest({ params: invoiceIdParamsSchema }),
  cancelInvoiceController,
);
