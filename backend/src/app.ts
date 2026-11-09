import express from "express";
import swaggerUi from "swagger-ui-express";
import { errorHandler } from "./middleware/error-handler";
import { branchesRouter } from "./modules/branches/branches.routes";
import { categoriesRouter } from "./modules/categories/categories.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { productsRouter } from "./modules/products/products.routes";
import { stockRouter } from "./modules/stock/stock.routes";
import { usersRouter } from "./modules/users/users.routes";
import { healthRouter } from "./modules/health/health.routes";
import { openApiSpec } from "./swagger";
import { AppError } from "./utils/app-error";

export const app = express();

app.use(express.json());
app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/branches", branchesRouter);
app.use("/categories", categoriesRouter);
app.use("/products", productsRouter);
app.use("/stock", stockRouter);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.use((_request, _response, next) => {
  next(new AppError(404, "NOT_FOUND", "Route not found"));
});
app.use(errorHandler);
