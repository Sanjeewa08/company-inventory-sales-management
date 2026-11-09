import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/validate-request";
import {
  createProductController,
  deactivateProductController,
  listProductsController,
  updateProductController,
} from "./products.controller";
import {
  createProductSchema,
  listProductsQuerySchema,
  productIdParamsSchema,
  updateProductSchema,
} from "./products.schema";

export const productsRouter = Router();
productsRouter.use(authenticate);

/**
 * @swagger
 * /products:
 *   get:
 *     summary: List products
 *     tags: [Products]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100 } }
 *       - { in: query, name: name, schema: { type: string } }
 *       - { in: query, name: sku, schema: { type: string } }
 *       - { in: query, name: categoryId, schema: { type: string, format: uuid } }
 *       - { in: query, name: isActive, schema: { type: boolean } }
 *       - { in: query, name: sortBy, schema: { type: string, enum: [name, sku, createdAt] } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200: { description: Paginated products }
 *       401: { description: Missing or invalid token }
 */
productsRouter.get(
  "/",
  validateRequest({ query: listProductsQuerySchema }),
  listProductsController,
);

/**
 * @swagger
 * /products:
 *   post:
 *     summary: Create a product (admin or manager)
 *     tags: [Products]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sku, name, categoryId, costPrice, sellingPrice]
 *             properties:
 *               sku: { type: string }
 *               name: { type: string }
 *               description: { type: string, nullable: true }
 *               unit: { type: string }
 *               categoryId: { type: string, format: uuid }
 *               costPrice: { type: string, pattern: '^\\d{1,10}(\\.\\d{1,2})?$' }
 *               sellingPrice: { type: string, pattern: '^\\d{1,10}(\\.\\d{1,2})?$' }
 *               reorderLevel: { type: integer, minimum: 0 }
 *     responses:
 *       201: { description: Created product }
 *       400: { description: Invalid request or category }
 *       401: { description: Missing or invalid token }
 *       403: { description: Manager or admin role required }
 */
productsRouter.post(
  "/",
  authorize("ADMIN", "MANAGER"),
  validateRequest({ body: createProductSchema }),
  createProductController,
);

/**
 * @swagger
 * /products/{id}:
 *   patch:
 *     summary: Update product details (admin or manager)
 *     tags: [Products]
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
 *               sku: { type: string }
 *               name: { type: string }
 *               description: { type: string, nullable: true }
 *               unit: { type: string }
 *               categoryId: { type: string, format: uuid }
 *               costPrice: { type: string }
 *               sellingPrice: { type: string }
 *               reorderLevel: { type: integer, minimum: 0 }
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Updated product }
 *       400: { description: Invalid request or category }
 *       401: { description: Missing or invalid token }
 *       403: { description: Manager or admin role required }
 *       404: { description: Product not found }
 */
productsRouter.patch(
  "/:id",
  authorize("ADMIN", "MANAGER"),
  validateRequest({ params: productIdParamsSchema, body: updateProductSchema }),
  updateProductController,
);

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     summary: Deactivate a product (admin or manager; no hard delete)
 *     tags: [Products]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Deactivated product }
 *       401: { description: Missing or invalid token }
 *       403: { description: Manager or admin role required }
 *       404: { description: Product not found }
 */
productsRouter.delete(
  "/:id",
  authorize("ADMIN", "MANAGER"),
  validateRequest({ params: productIdParamsSchema }),
  deactivateProductController,
);
