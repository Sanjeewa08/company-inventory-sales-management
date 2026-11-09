import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { AppError } from "../utils/app-error";

export interface ValidatedInput {
  body: unknown;
  params: unknown;
  query: unknown;
}

declare module "express-serve-static-core" {
  interface Locals {
    validated: ValidatedInput;
  }
}

export function validateRequest(
  schemas: Partial<Record<keyof ValidatedInput, ZodType>>,
): RequestHandler {
  return (request, response, next) => {
    const input: ValidatedInput = {
      body: request.body,
      params: request.params,
      query: request.query,
    };

    for (const key of ["body", "params", "query"] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(input[key]);
      if (!result.success) {
        next(
          new AppError(400, "VALIDATION_ERROR", "Request validation failed", {
            [key]: result.error.flatten(),
          }),
        );
        return;
      }
      input[key] = result.data;
    }

    response.locals.validated = input;
    next();
  };
}
