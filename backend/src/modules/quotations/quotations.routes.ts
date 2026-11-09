import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/validate-request";
import {
  acceptQuotationController,
  convertQuotationController,
  createQuotationController,
  expireQuotationController,
  getQuotationController,
  listQuotationsController,
  sendQuotationController,
  updateQuotationController,
} from "./quotations.controller";
import {
  createQuotationSchema,
  listQuotationsQuerySchema,
  quotationIdParamsSchema,
  updateQuotationSchema,
} from "./quotations.schema";

export const quotationsRouter = Router();
quotationsRouter.use(authenticate, authorize("SALES", "MANAGER", "ADMIN"));

/**
 * @swagger
 * /quotations:
 *   get:
 *     summary: List quotations in the caller's permitted branches
 *     tags: [Quotations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100 } }
 *       - { in: query, name: search, schema: { type: string, description: Match quotation number, customer name, or email } }
 *       - { in: query, name: status, schema: { type: string, enum: [DRAFT, SENT, ACCEPTED, EXPIRED, REJECTED] } }
 *       - { in: query, name: customerId, schema: { type: string, format: uuid } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: sortBy, schema: { type: string, enum: [number, issuedAt, createdAt, total] } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200: { description: Paginated quotations }
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 */
quotationsRouter.get(
  "/",
  validateRequest({ query: listQuotationsQuerySchema }),
  listQuotationsController,
);

/**
 * @swagger
 * /quotations:
 *   post:
 *     summary: Create a draft quotation
 *     tags: [Quotations]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerId, branchId, items]
 *             properties:
 *               customerId: { type: string, format: uuid }
 *               branchId: { type: string, format: uuid }
 *               validUntil: { type: string, format: date-time, nullable: true }
 *               notes: { type: string, nullable: true }
 *               tax: { type: string, description: Non-negative decimal amount }
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [productId, quantity, unitPrice]
 *                   properties:
 *                     productId: { type: string, format: uuid }
 *                     quantity: { type: integer, minimum: 1 }
 *                     unitPrice: { type: string, description: Non-negative decimal amount }
 *     responses:
 *       201: { description: Created draft quotation with generated number }
 *       400: { description: Invalid quotation or branch scope }
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 *       404: { description: Active customer, branch, or product not found }
 */
quotationsRouter.post(
  "/",
  validateRequest({ body: createQuotationSchema }),
  createQuotationController,
);

/**
 * @swagger
 * /quotations/{id}:
 *   get:
 *     summary: Get a quotation
 *     tags: [Quotations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Quotation details and line items }
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 *       404: { description: Quotation not found }
 */
quotationsRouter.get(
  "/:id",
  validateRequest({ params: quotationIdParamsSchema }),
  getQuotationController,
);

/**
 * @swagger
 * /quotations/{id}:
 *   patch:
 *     summary: Update a draft quotation
 *     tags: [Quotations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customerId: { type: string, format: uuid }
 *               branchId: { type: string, format: uuid }
 *               validUntil: { type: string, format: date-time, nullable: true }
 *               notes: { type: string, nullable: true }
 *               tax: { type: string }
 *               items: { type: array, items: { type: object } }
 *     responses:
 *       200: { description: Updated draft quotation }
 *       400: { description: Invalid quotation or branch scope }
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 *       404: { description: Quotation, customer, branch, or product not found }
 *       409: { description: Quotation is not a draft }
 */
quotationsRouter.patch(
  "/:id",
  validateRequest({
    params: quotationIdParamsSchema,
    body: updateQuotationSchema,
  }),
  updateQuotationController,
);

/**
 * @swagger
 * /quotations/{id}/send:
 *   post:
 *     summary: Send a draft quotation
 *     tags: [Quotations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Sent quotation }
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 *       404: { description: Quotation not found }
 *       409: { description: Quotation cannot be sent in its current state or has expired }
 */
quotationsRouter.post(
  "/:id/send",
  validateRequest({ params: quotationIdParamsSchema }),
  sendQuotationController,
);

/**
 * @swagger
 * /quotations/{id}/accept:
 *   post:
 *     summary: Accept a sent quotation
 *     tags: [Quotations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Accepted quotation }
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 *       404: { description: Quotation not found }
 *       409: { description: Quotation cannot be accepted in its current state or has expired }
 */
quotationsRouter.post(
  "/:id/accept",
  validateRequest({ params: quotationIdParamsSchema }),
  acceptQuotationController,
);

/**
 * @swagger
 * /quotations/{id}/expire:
 *   post:
 *     summary: Expire a sent quotation
 *     tags: [Quotations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Expired quotation }
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 *       404: { description: Quotation not found }
 *       409: { description: Only sent quotations can be expired }
 */
quotationsRouter.post(
  "/:id/expire",
  validateRequest({ params: quotationIdParamsSchema }),
  expireQuotationController,
);

/**
 * @swagger
 * /quotations/{id}/convert:
 *   post:
 *     summary: Prepare invoice input from an accepted quotation
 *     description: Returns a payload only; it does not create an invoice or deduct stock.
 *     tags: [Quotations]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Invoice-ready payload from the accepted quotation }
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 *       404: { description: Quotation not found }
 *       409: { description: Quotation is not accepted }
 */
quotationsRouter.post(
  "/:id/convert",
  validateRequest({ params: quotationIdParamsSchema }),
  convertQuotationController,
);
