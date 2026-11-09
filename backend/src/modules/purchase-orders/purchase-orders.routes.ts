import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/validate-request";
import {
  approvePurchaseOrderController,
  cancelPurchaseOrderController,
  createPurchaseOrderController,
  getPurchaseOrderController,
  listPurchaseOrdersController,
  updatePurchaseOrderController,
} from "./purchase-orders.controller";
import {
  createPurchaseOrderSchema,
  listPurchaseOrdersQuerySchema,
  purchaseOrderIdParamsSchema,
  updatePurchaseOrderSchema,
} from "./purchase-orders.schema";

export const purchaseOrdersRouter = Router();
purchaseOrdersRouter.use(
  authenticate,
  authorize("ADMIN", "MANAGER", "STOREKEEPER"),
);

/**
 * @swagger
 * /purchase-orders:
 *   post:
 *     summary: Create a draft purchase order
 *     tags: [Purchase Orders]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [supplierId, branchId, items]
 *             properties:
 *               supplierId: { type: string, format: uuid }
 *               branchId: { type: string, format: uuid }
 *               expectedAt: { type: string, format: date-time, nullable: true }
 *               notes: { type: string, nullable: true }
 *               tax: { type: string, description: Non-negative decimal amount }
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [productId, quantity, unitCost]
 *                   properties:
 *                     productId: { type: string, format: uuid }
 *                     quantity: { type: integer, minimum: 1 }
 *                     unitCost: { type: string, description: Non-negative decimal amount }
 *     responses:
 *       201: { description: Created draft purchase order with generated number }
 *       400: { description: Invalid order or branch scope }
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 *       404: { description: Supplier, branch, or product not found }
 */
purchaseOrdersRouter.post(
  "/",
  validateRequest({ body: createPurchaseOrderSchema }),
  createPurchaseOrderController,
);

/**
 * @swagger
 * /purchase-orders:
 *   get:
 *     summary: List purchase orders for the caller's permitted branches
 *     tags: [Purchase Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100 } }
 *       - { in: query, name: search, schema: { type: string, description: Match PO number or supplier name } }
 *       - { in: query, name: status, schema: { type: string, enum: [DRAFT, APPROVED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED] } }
 *       - { in: query, name: supplierId, schema: { type: string, format: uuid } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: sortBy, schema: { type: string, enum: [number, orderedAt, createdAt, total] } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200: { description: Paginated purchase orders }
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 */
purchaseOrdersRouter.get(
  "/",
  validateRequest({ query: listPurchaseOrdersQuerySchema }),
  listPurchaseOrdersController,
);

/**
 * @swagger
 * /purchase-orders/{id}:
 *   get:
 *     summary: Get a purchase order
 *     tags: [Purchase Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Purchase order details and line items }
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 *       404: { description: Purchase order not found }
 */
purchaseOrdersRouter.get(
  "/:id",
  validateRequest({ params: purchaseOrderIdParamsSchema }),
  getPurchaseOrderController,
);

/**
 * @swagger
 * /purchase-orders/{id}:
 *   patch:
 *     summary: Update a draft purchase order
 *     tags: [Purchase Orders]
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
 *               supplierId: { type: string, format: uuid }
 *               branchId: { type: string, format: uuid }
 *               expectedAt: { type: string, format: date-time, nullable: true }
 *               notes: { type: string, nullable: true }
 *               tax: { type: string }
 *               items: { type: array, items: { type: object } }
 *     responses:
 *       200: { description: Updated draft purchase order }
 *       400: { description: Invalid order or branch scope }
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 *       404: { description: Purchase order not found }
 *       409: { description: Purchase order is not a draft }
 */
purchaseOrdersRouter.patch(
  "/:id",
  validateRequest({
    params: purchaseOrderIdParamsSchema,
    body: updatePurchaseOrderSchema,
  }),
  updatePurchaseOrderController,
);

/**
 * @swagger
 * /purchase-orders/{id}/approve:
 *   post:
 *     summary: Approve a draft purchase order (admin or manager only)
 *     tags: [Purchase Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Approved purchase order }
 *       401: { description: Missing or invalid token }
 *       403: { description: Manager or admin role required }
 *       404: { description: Purchase order not found }
 *       409: { description: Purchase order is not a draft }
 */
purchaseOrdersRouter.post(
  "/:id/approve",
  authorize("ADMIN", "MANAGER"),
  validateRequest({ params: purchaseOrderIdParamsSchema }),
  approvePurchaseOrderController,
);

/**
 * @swagger
 * /purchase-orders/{id}/cancel:
 *   post:
 *     summary: Cancel a draft purchase order, or an approved order as manager/admin
 *     tags: [Purchase Orders]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Cancelled purchase order }
 *       401: { description: Missing or invalid token }
 *       403: { description: Role or branch access forbidden }
 *       404: { description: Purchase order not found }
 *       409: { description: Purchase order cannot be cancelled }
 */
purchaseOrdersRouter.post(
  "/:id/cancel",
  validateRequest({ params: purchaseOrderIdParamsSchema }),
  cancelPurchaseOrderController,
);
