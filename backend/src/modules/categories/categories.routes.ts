import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/validate-request";
import {
  createCategoryController,
  deactivateCategoryController,
  listCategoriesController,
  updateCategoryController,
} from "./categories.controller";
import {
  categoryIdParamsSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from "./categories.schema";

export const categoriesRouter = Router();
categoriesRouter.use(authenticate);

/**
 * @swagger
 * /categories:
 *   get:
 *     summary: List categories
 *     tags: [Categories]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100 } }
 *       - { in: query, name: name, schema: { type: string } }
 *       - { in: query, name: isActive, schema: { type: boolean } }
 *       - { in: query, name: sortBy, schema: { type: string, enum: [name, createdAt] } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200: { description: Paginated categories }
 *       401: { description: Missing or invalid token }
 */
categoriesRouter.get(
  "/",
  validateRequest({ query: listCategoriesQuerySchema }),
  listCategoriesController,
);

/**
 * @swagger
 * /categories:
 *   post:
 *     summary: Create a category (admin or manager)
 *     tags: [Categories]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string, nullable: true }
 *     responses:
 *       201: { description: Created category }
 *       400: { description: Invalid request }
 *       401: { description: Missing or invalid token }
 *       403: { description: Manager or admin role required }
 */
categoriesRouter.post(
  "/",
  authorize("ADMIN", "MANAGER"),
  validateRequest({ body: createCategorySchema }),
  createCategoryController,
);

/**
 * @swagger
 * /categories/{id}:
 *   patch:
 *     summary: Update category details (admin or manager)
 *     tags: [Categories]
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
 *               name: { type: string }
 *               description: { type: string, nullable: true }
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Updated category }
 *       400: { description: Invalid request }
 *       401: { description: Missing or invalid token }
 *       403: { description: Manager or admin role required }
 *       404: { description: Category not found }
 */
categoriesRouter.patch(
  "/:id",
  authorize("ADMIN", "MANAGER"),
  validateRequest({
    params: categoryIdParamsSchema,
    body: updateCategorySchema,
  }),
  updateCategoryController,
);

/**
 * @swagger
 * /categories/{id}:
 *   delete:
 *     summary: Deactivate a category (admin or manager; no hard delete)
 *     tags: [Categories]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Deactivated category }
 *       401: { description: Missing or invalid token }
 *       403: { description: Manager or admin role required }
 *       404: { description: Category not found }
 */
categoriesRouter.delete(
  "/:id",
  authorize("ADMIN", "MANAGER"),
  validateRequest({ params: categoryIdParamsSchema }),
  deactivateCategoryController,
);
