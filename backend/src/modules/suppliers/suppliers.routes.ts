import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/validate-request";
import {
  createSupplierController,
  deactivateSupplierController,
  getSupplierController,
  listSuppliersController,
  updateSupplierController,
} from "./suppliers.controller";
import {
  createSupplierSchema,
  listSuppliersQuerySchema,
  supplierIdParamsSchema,
  updateSupplierSchema,
} from "./suppliers.schema";

export const suppliersRouter = Router();
suppliersRouter.use(authenticate);

/**
 * @swagger
 * /suppliers:
 *   get:
 *     summary: Search and list suppliers
 *     tags: [Suppliers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100 } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: isActive, schema: { type: boolean } }
 *       - { in: query, name: sortBy, schema: { type: string, enum: [name, createdAt] } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200: { description: Paginated suppliers }
 *       401: { description: Missing or invalid token }
 */
suppliersRouter.get(
  "/",
  validateRequest({ query: listSuppliersQuerySchema }),
  listSuppliersController,
);

/**
 * @swagger
 * /suppliers:
 *   post:
 *     summary: Create a supplier (admin or manager)
 *     tags: [Suppliers]
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
 *               contactName: { type: string, nullable: true }
 *               email: { type: string, format: email, nullable: true }
 *               phone: { type: string, nullable: true }
 *               address: { type: string, nullable: true }
 *               taxNumber: { type: string, nullable: true }
 *     responses:
 *       201: { description: Created supplier }
 *       400: { description: Invalid request }
 *       401: { description: Missing or invalid token }
 *       403: { description: Manager or admin role required }
 */
suppliersRouter.post(
  "/",
  authorize("ADMIN", "MANAGER"),
  validateRequest({ body: createSupplierSchema }),
  createSupplierController,
);

/**
 * @swagger
 * /suppliers/{id}:
 *   get:
 *     summary: Get a supplier
 *     tags: [Suppliers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Supplier details }
 *       401: { description: Missing or invalid token }
 *       404: { description: Supplier not found }
 */
suppliersRouter.get(
  "/:id",
  validateRequest({ params: supplierIdParamsSchema }),
  getSupplierController,
);

/**
 * @swagger
 * /suppliers/{id}:
 *   patch:
 *     summary: Update a supplier (admin or manager)
 *     tags: [Suppliers]
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
 *               contactName: { type: string, nullable: true }
 *               email: { type: string, format: email, nullable: true }
 *               phone: { type: string, nullable: true }
 *               address: { type: string, nullable: true }
 *               taxNumber: { type: string, nullable: true }
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Updated supplier }
 *       400: { description: Invalid request }
 *       401: { description: Missing or invalid token }
 *       403: { description: Manager or admin role required }
 *       404: { description: Supplier not found }
 */
suppliersRouter.patch(
  "/:id",
  authorize("ADMIN", "MANAGER"),
  validateRequest({
    params: supplierIdParamsSchema,
    body: updateSupplierSchema,
  }),
  updateSupplierController,
);

/**
 * @swagger
 * /suppliers/{id}:
 *   delete:
 *     summary: Deactivate a supplier (admin or manager; no hard delete)
 *     tags: [Suppliers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Deactivated supplier }
 *       401: { description: Missing or invalid token }
 *       403: { description: Manager or admin role required }
 *       404: { description: Supplier not found }
 */
suppliersRouter.delete(
  "/:id",
  authorize("ADMIN", "MANAGER"),
  validateRequest({ params: supplierIdParamsSchema }),
  deactivateSupplierController,
);
