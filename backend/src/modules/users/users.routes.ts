import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/validate-request";
import {
  createUserController,
  deactivateUserController,
  listUsersController,
  updateUserController,
} from "./users.controller";
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userIdParamsSchema,
} from "./users.schema";

export const usersRouter = Router();
usersRouter.use(authenticate, authorize("ADMIN"));

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a user (admin only)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, role]
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               role: { type: string, enum: [ADMIN, MANAGER, STOREKEEPER, SALES, ACCOUNTANT] }
 *               branchId: { type: string, format: uuid, nullable: true }
 *     responses:
 *       201: { description: Created user }
 *       400: { description: Invalid request }
 *       401: { description: Missing or invalid token }
 *       403: { description: Admin role required }
 */
usersRouter.post(
  "/",
  validateRequest({ body: createUserSchema }),
  createUserController,
);

/**
 * @swagger
 * /users:
 *   get:
 *     summary: List users with pagination and filters (admin only)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100 } }
 *       - { in: query, name: name, schema: { type: string } }
 *       - { in: query, name: email, schema: { type: string } }
 *       - { in: query, name: role, schema: { type: string, enum: [ADMIN, MANAGER, STOREKEEPER, SALES, ACCOUNTANT] } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: isActive, schema: { type: boolean } }
 *     responses:
 *       200: { description: Paginated users }
 *       401: { description: Missing or invalid token }
 *       403: { description: Admin role required }
 */
usersRouter.get(
  "/",
  validateRequest({ query: listUsersQuerySchema }),
  listUsersController,
);

/**
 * @swagger
 * /users/{id}:
 *   patch:
 *     summary: Update user details (admin only)
 *     tags: [Users]
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
 *               email: { type: string, format: email }
 *               role: { type: string, enum: [ADMIN, MANAGER, STOREKEEPER, SALES, ACCOUNTANT] }
 *               branchId: { type: string, format: uuid, nullable: true }
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Updated user }
 *       400: { description: Invalid request }
 *       401: { description: Missing or invalid token }
 *       403: { description: Admin role required }
 *       404: { description: User not found }
 */
usersRouter.patch(
  "/:id",
  validateRequest({ params: userIdParamsSchema, body: updateUserSchema }),
  updateUserController,
);

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Deactivate user (admin only; no hard delete)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Deactivated user }
 *       401: { description: Missing or invalid token }
 *       403: { description: Admin role required }
 *       404: { description: User not found }
 */
usersRouter.delete(
  "/:id",
  validateRequest({ params: userIdParamsSchema }),
  deactivateUserController,
);
