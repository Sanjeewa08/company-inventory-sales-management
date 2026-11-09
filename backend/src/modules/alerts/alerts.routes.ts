import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { validateRequest } from "../../middleware/validate-request";
import {
  acknowledgeLowStockAlertController,
  listLowStockAlertsController,
} from "./alerts.controller";
import {
  alertIdParamsSchema,
  listLowStockAlertsQuerySchema,
} from "./alerts.schema";

export const alertsRouter = Router();
alertsRouter.use(authenticate);

/**
 * @swagger
 * /alerts/low-stock:
 *   get:
 *     summary: List active low-stock alerts, scoped to the user's branch unless admin
 *     tags: [Alerts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: acknowledged, schema: { type: boolean } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100 } }
 *       - { in: query, name: sortBy, schema: { type: string, enum: [createdAt, updatedAt, isRead] } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200: { description: Paginated active low-stock alerts }
 *       400: { description: Invalid query parameters }
 *       401: { description: Missing or invalid token }
 *       403: { description: Branch access forbidden }
 */
alertsRouter.get(
  "/low-stock",
  validateRequest({ query: listLowStockAlertsQuerySchema }),
  listLowStockAlertsController,
);

/**
 * @swagger
 * /alerts/{id}/acknowledge:
 *   patch:
 *     summary: Acknowledge a low-stock alert
 *     tags: [Alerts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Acknowledged alert }
 *       401: { description: Missing or invalid token }
 *       403: { description: Branch access forbidden }
 *       404: { description: Alert not found }
 */
alertsRouter.patch(
  "/:id/acknowledge",
  validateRequest({ params: alertIdParamsSchema }),
  acknowledgeLowStockAlertController,
);
