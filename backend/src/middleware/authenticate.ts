import jwt from "jsonwebtoken";
import type { RequestHandler } from "express";
import { loadConfig } from "../config";
import { getActiveUserById } from "../modules/auth/auth.service";
import type { UserRole } from "../generated/prisma/enums";
import { AppError } from "../utils/app-error";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branchId: string | null;
  isActive: boolean;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;
  }
}

export const authenticate: RequestHandler = async (
  request,
  _response,
  next,
) => {
  const authorization = request.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    next(new AppError(401, "UNAUTHORIZED", "Authentication is required"));
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    next(new AppError(401, "UNAUTHORIZED", "Authentication is required"));
    return;
  }

  try {
    const payload = jwt.verify(token, loadConfig(process.env).jwtSecret);
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      throw new AppError(401, "UNAUTHORIZED", "Invalid authentication token");
    }

    const user = await getActiveUserById(payload.sub);
    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "Invalid authentication token");
    }
    request.user = user;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError(401, "UNAUTHORIZED", "Invalid authentication token"));
      return;
    }
    next(error);
  }
};
