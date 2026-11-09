import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/validate-request";
import {
  getBranchComparisonReportController,
  getOutstandingPaymentsReportController,
  getSalesReportController,
  getStockValuationReportController,
  getTopProductsReportController,
} from "./reports.controller";
import {
  branchComparisonQuerySchema,
  outstandingPaymentsQuerySchema,
  salesReportQuerySchema,
  stockValuationQuerySchema,
  topProductsQuerySchema,
} from "./reports.schema";

export const reportsRouter = Router();
reportsRouter.use(authenticate);

/**
 * @swagger
 * /reports/sales:
 *   get:
 *     summary: Sales totals grouped by day or month, excluding cancelled invoices
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: from, required: true, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, required: true, schema: { type: string, format: date-time } }
 *       - { in: query, name: groupBy, schema: { type: string, enum: [day, month] } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Sales invoice count and monetary totals per period }
 *       400: { description: Invalid query parameters or date range }
 *       401: { description: Missing or invalid token }
 *       403: { description: Manager, admin, or accountant role required }
 */
reportsRouter.get(
  "/sales",
  authorize("MANAGER", "ADMIN", "ACCOUNTANT"),
  validateRequest({ query: salesReportQuerySchema }),
  getSalesReportController,
);

/**
 * @swagger
 * /reports/stock-valuation:
 *   get:
 *     summary: Stock valuation by branch and product with branch and grand totals
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Product valuations, branch totals, and grand total }
 *       401: { description: Missing or invalid token }
 *       403: { description: Manager, admin, or accountant role required }
 */
reportsRouter.get(
  "/stock-valuation",
  authorize("MANAGER", "ADMIN", "ACCOUNTANT"),
  validateRequest({ query: stockValuationQuerySchema }),
  getStockValuationReportController,
);

/**
 * @swagger
 * /reports/top-products:
 *   get:
 *     summary: Best-selling products by quantity and revenue
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: from, required: true, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, required: true, schema: { type: string, format: date-time } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 10 } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Products ranked by units sold and revenue }
 *       400: { description: Invalid query parameters or date range }
 *       401: { description: Missing or invalid token }
 *       403: { description: Manager or admin role required }
 */
reportsRouter.get(
  "/top-products",
  authorize("MANAGER", "ADMIN"),
  validateRequest({ query: topProductsQuerySchema }),
  getTopProductsReportController,
);

/**
 * @swagger
 * /reports/branch-comparison:
 *   get:
 *     summary: Compare branch sales totals, invoice counts, and stock values
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: from, required: true, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, required: true, schema: { type: string, format: date-time } }
 *     responses:
 *       200: { description: Sales and valuation metrics for each branch }
 *       400: { description: Invalid query parameters or date range }
 *       401: { description: Missing or invalid token }
 *       403: { description: Manager or admin role required }
 */
reportsRouter.get(
  "/branch-comparison",
  authorize("MANAGER", "ADMIN"),
  validateRequest({ query: branchComparisonQuerySchema }),
  getBranchComparisonReportController,
);

/**
 * @swagger
 * /reports/outstanding-payments:
 *   get:
 *     summary: List pending and partially paid invoices with outstanding balances
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Outstanding invoices, balances, and age in days }
 *       401: { description: Missing or invalid token }
 *       403: { description: Manager, admin, or accountant role required }
 */
reportsRouter.get(
  "/outstanding-payments",
  authorize("MANAGER", "ADMIN", "ACCOUNTANT"),
  validateRequest({ query: outstandingPaymentsQuerySchema }),
  getOutstandingPaymentsReportController,
);
