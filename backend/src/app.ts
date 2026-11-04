import express from "express";
import { errorHandler } from "./middleware/error-handler";
import { healthRouter } from "./modules/health/health.routes";
import { AppError } from "./utils/app-error";

export const app = express();

app.use(express.json());
app.use("/health", healthRouter);
app.use((_request, _response, next) => {
  next(new AppError(404, "NOT_FOUND", "Route not found"));
});
app.use(errorHandler);
