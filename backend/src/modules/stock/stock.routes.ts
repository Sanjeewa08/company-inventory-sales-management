import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/validate-request";
import {
  adjustStockController,
  listStockController,
  transferStockController,
} from "./stock.controller";
import {
  adjustStockSchema,
  listStockQuerySchema,
  transferStockSchema,
} from "./stock.schema";

export const stockRouter = Router();
stockRouter.use(authenticate);

/**
 * @swagger
 * /stock:
 *   get:
 *     summary: List stock (branch-scoped for non-admin and non-manager users)
 *     tags: [Stock]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100 } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: productId, schema: { type: string, format: uuid } }
 *       - { in: query, name: sortBy, schema: { type: string, enum: [quantity, createdAt] } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200: { description: Paginated stock }
 *       401: { description: Missing or invalid token }
 *       403: { description: Branch access forbidden }
 */
stockRouter.get(
  "/",
  validateRequest({ query: listStockQuerySchema }),
  listStockController,
);

/**
 * @swagger
 * /stock/adjustments:
 *   post:
 *     summary: Adjust stock in a branch
 *     tags: [Stock]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [branchId, productId, quantity]
 *             properties:
 *               branchId: { type: string, format: uuid }
 *               productId: { type: string, format: uuid }
 *               quantity: { type: integer, description: Non-zero; may be negative to reduce stock }
 *               notes: { type: string, nullable: true }
 *     responses:
 *       200: { description: Updated stock }
 *       400: { description: Invalid request or insufficient stock }
 *       401: { description: Missing or invalid token }
 *       403: { description: Branch access forbidden }
 *       404: { description: Branch or product not found }
 */
stockRouter.post(
  "/adjustments",
  authorize("ADMIN", "MANAGER", "STOREKEEPER"),
  validateRequest({ body: adjustStockSchema }),
  adjustStockController,
);

/**
 * @swagger
 * /stock/transfers:
 *   post:
 *     summary: Transfer stock between branches
 *     tags: [Stock]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fromBranchId, toBranchId, items]
 *             properties:
 *               fromBranchId: { type: string, format: uuid }
 *               toBranchId: { type: string, format: uuid }
 *               notes: { type: string, nullable: true }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [productId, quantity]
 *                   properties:
 *                     productId: { type: string, format: uuid }
 *                     quantity: { type: integer, minimum: 1 }
 *     responses:
 *       201: { description: Completed transfer }
 *       400: { description: Invalid request or insufficient stock }
 *       401: { description: Missing or invalid token }
 *       403: { description: Branch access forbidden }
 *       404: { description: Branch or product not found }
 */
stockRouter.post(
  "/transfers",
  authorize("ADMIN", "MANAGER", "STOREKEEPER"),
  validateRequest({ body: transferStockSchema }),
  transferStockController,
);
