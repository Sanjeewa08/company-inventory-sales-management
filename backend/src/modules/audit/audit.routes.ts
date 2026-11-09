import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/validate-request";
import { listAuditLogsController } from "./audit.controller";
import { listAuditLogsQuerySchema } from "./audit.schema";

export const auditRouter = Router();
auditRouter.use(authenticate, authorize("ADMIN"));

/**
 * @swagger
 * /audit-logs:
 *   get:
 *     summary: List audit logs (admin only)
 *     tags: [Audit]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100 } }
 *       - { in: query, name: userId, schema: { type: string, format: uuid } }
 *       - { in: query, name: entity, schema: { type: string } }
 *       - { in: query, name: action, schema: { type: string, enum: [CREATE, UPDATE, DELETE, LOGIN, LOGOUT, APPROVE, CANCEL] } }
 *       - { in: query, name: startDate, schema: { type: string, format: date-time } }
 *       - { in: query, name: endDate, schema: { type: string, format: date-time } }
 *       - { in: query, name: sortBy, schema: { type: string, enum: [createdAt, entity, action, userId] } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200: { description: Paginated audit entries }
 *       400: { description: Invalid query parameters or date range }
 *       401: { description: Missing or invalid token }
 *       403: { description: Admin role required }
 */
auditRouter.get(
  "/",
  validateRequest({ query: listAuditLogsQuerySchema }),
  listAuditLogsController,
);
