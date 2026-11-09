import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/validate-request";
import {
  createCustomerController,
  deactivateCustomerController,
  getCustomerController,
  listCustomersController,
  updateCustomerController,
} from "./customers.controller";
import {
  createCustomerSchema,
  customerIdParamsSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "./customers.schema";

export const customersRouter = Router();
customersRouter.use(authenticate, authorize("SALES", "MANAGER", "ADMIN"));

/**
 * @swagger
 * /customers:
 *   get:
 *     summary: Search and list customers
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100 } }
 *       - { in: query, name: search, schema: { type: string, description: Match name, email, phone, or tax number } }
 *       - { in: query, name: isActive, schema: { type: boolean } }
 *       - { in: query, name: sortBy, schema: { type: string, enum: [name, createdAt] } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200: { description: Paginated customers }
 *       401: { description: Missing or invalid token }
 *       403: { description: SALES, MANAGER, or ADMIN role required }
 */
customersRouter.get(
  "/",
  validateRequest({ query: listCustomersQuerySchema }),
  listCustomersController,
);

/**
 * @swagger
 * /customers:
 *   post:
 *     summary: Create a customer
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, maxLength: 160 }
 *               email: { type: string, format: email, nullable: true }
 *               phone: { type: string, nullable: true }
 *               address: { type: string, nullable: true }
 *               taxNumber: { type: string, nullable: true }
 *     responses:
 *       201: { description: Created customer }
 *       400: { description: Invalid customer input }
 *       401: { description: Missing or invalid token }
 *       403: { description: SALES, MANAGER, or ADMIN role required }
 *       409: { description: Customer email already exists }
 */
customersRouter.post(
  "/",
  validateRequest({ body: createCustomerSchema }),
  createCustomerController,
);

/**
 * @swagger
 * /customers/{id}:
 *   get:
 *     summary: Get a customer
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Customer details }
 *       401: { description: Missing or invalid token }
 *       403: { description: SALES, MANAGER, or ADMIN role required }
 *       404: { description: Customer not found }
 */
customersRouter.get(
  "/:id",
  validateRequest({ params: customerIdParamsSchema }),
  getCustomerController,
);

/**
 * @swagger
 * /customers/{id}:
 *   patch:
 *     summary: Update a customer
 *     tags: [Customers]
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
 *               email: { type: string, format: email, nullable: true }
 *               phone: { type: string, nullable: true }
 *               address: { type: string, nullable: true }
 *               taxNumber: { type: string, nullable: true }
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Updated customer }
 *       400: { description: Invalid customer input }
 *       401: { description: Missing or invalid token }
 *       403: { description: SALES, MANAGER, or ADMIN role required }
 *       404: { description: Customer not found }
 *       409: { description: Customer email already exists }
 */
customersRouter.patch(
  "/:id",
  validateRequest({
    params: customerIdParamsSchema,
    body: updateCustomerSchema,
  }),
  updateCustomerController,
);

/**
 * @swagger
 * /customers/{id}:
 *   delete:
 *     summary: Deactivate a customer without deleting its history
 *     tags: [Customers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Deactivated customer }
 *       401: { description: Missing or invalid token }
 *       403: { description: SALES, MANAGER, or ADMIN role required }
 *       404: { description: Customer not found }
 */
customersRouter.delete(
  "/:id",
  validateRequest({ params: customerIdParamsSchema }),
  deactivateCustomerController,
);
