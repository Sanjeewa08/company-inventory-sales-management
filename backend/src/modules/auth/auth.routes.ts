import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { authenticate } from "../../middleware/authenticate";
import { validateRequest } from "../../middleware/validate-request";
import { AppError } from "../../utils/app-error";
import {
  changePasswordController,
  loginController,
  meController,
} from "./auth.controller";
import { changePasswordSchema, loginSchema } from "./auth.schema";

export const authRouter = Router();

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, _response, next) => {
    next(new AppError(429, "RATE_LIMITED", "Too many login attempts"));
  },
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in and receive an access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Authenticated user and JWT }
 *       400: { description: Invalid request }
 *       401: { description: Invalid credentials }
 *       429: { description: Too many login attempts }
 */
authRouter.post(
  "/login",
  loginRateLimit,
  validateRequest({ body: loginSchema }),
  loginController,
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get the authenticated user
 *     tags: [Authentication]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Current user }
 *       401: { description: Missing or invalid token }
 */
authRouter.get("/me", authenticate, meController);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change the authenticated user's password
 *     tags: [Authentication]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       204: { description: Password changed }
 *       400: { description: Invalid request or current password }
 *       401: { description: Missing or invalid token }
 */
authRouter.post(
  "/change-password",
  authenticate,
  validateRequest({ body: changePasswordSchema }),
  changePasswordController,
);
