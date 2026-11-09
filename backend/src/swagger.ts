import { join } from "node:path";
import swaggerJsdoc from "swagger-jsdoc";

export const openApiSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Company Inventory & Sales Management API",
      version: "1.0.0",
    },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: [join(__dirname, "modules/**/*.routes.{ts,js}").replace(/\\/g, "/")],
});
