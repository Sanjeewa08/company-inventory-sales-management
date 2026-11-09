import type { RequestHandler } from "express";
import type { UserRole } from "../generated/prisma/enums";
import { AppError } from "../utils/app-error";

export function authorize(...roles: UserRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.user) {
      next(new AppError(401, "UNAUTHORIZED", "Authentication is required"));
      return;
    }
    if (!roles.includes(request.user.role)) {
      next(new AppError(403, "FORBIDDEN", "You do not have permission"));
      return;
    }
    next();
  };
}
