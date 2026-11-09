import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/validate-request";
import {
  createBranchController,
  deactivateBranchController,
  listBranchesController,
  updateBranchController,
} from "./branches.controller";
import {
  branchIdParamsSchema,
  createBranchSchema,
  listBranchesQuerySchema,
  updateBranchSchema,
} from "./branches.schema";

export const branchesRouter = Router();
branchesRouter.use(authenticate);

/**
 * @swagger
 * /branches:
 *   get:
 *     summary: List branches (non-manager users see only their own branch)
 *     tags: [Branches]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100 } }
 *       - { in: query, name: name, schema: { type: string } }
 *       - { in: query, name: isActive, schema: { type: boolean } }
 *       - { in: query, name: sortBy, schema: { type: string, enum: [name, createdAt] } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200: { description: Paginated branches }
 *       401: { description: Missing or invalid token }
 */
branchesRouter.get(
  "/",
  validateRequest({ query: listBranchesQuerySchema }),
  listBranchesController,
);

/**
 * @swagger
 * /branches:
 *   post:
 *     summary: Create a branch (admin only)
 *     tags: [Branches]
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
 *               address: { type: string, nullable: true }
 *               phone: { type: string, nullable: true }
 *     responses:
 *       201: { description: Created branch }
 *       400: { description: Invalid request }
 *       401: { description: Missing or invalid token }
 *       403: { description: Admin role required }
 */
branchesRouter.post(
  "/",
  authorize("ADMIN"),
  validateRequest({ body: createBranchSchema }),
  createBranchController,
);

/**
 * @swagger
 * /branches/{id}:
 *   patch:
 *     summary: Update branch details (admin only)
 *     tags: [Branches]
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
 *               address: { type: string, nullable: true }
 *               phone: { type: string, nullable: true }
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Updated branch }
 *       400: { description: Invalid request }
 *       401: { description: Missing or invalid token }
 *       403: { description: Admin role required }
 *       404: { description: Branch not found }
 */
branchesRouter.patch(
  "/:id",
  authorize("ADMIN"),
  validateRequest({ params: branchIdParamsSchema, body: updateBranchSchema }),
  updateBranchController,
);

/**
 * @swagger
 * /branches/{id}:
 *   delete:
 *     summary: Deactivate a branch (admin only; no hard delete)
 *     tags: [Branches]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Deactivated branch }
 *       401: { description: Missing or invalid token }
 *       403: { description: Admin role required }
 *       404: { description: Branch not found }
 */
branchesRouter.delete(
  "/:id",
  authorize("ADMIN"),
  validateRequest({ params: branchIdParamsSchema }),
  deactivateBranchController,
);
