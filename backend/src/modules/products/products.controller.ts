import type { RequestHandler } from "express";
import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from "./products.schema";
import {
  createProduct,
  deactivateProduct,
  listProducts,
  updateProduct,
} from "./products.service";

export const listProductsController: RequestHandler = async (
  _request,
  response,
) => {
  const query = response.locals.validated.query as ListProductsQuery;
  const result = await listProducts(query);
  response.status(200).json({
    products: result.products,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    },
  });
};

export const createProductController: RequestHandler = async (
  request,
  response,
) => {
  const input = response.locals.validated.body as CreateProductInput;
  const product = await createProduct(input, request.user!.id, request.ip);
  response.status(201).json({ product });
};

export const updateProductController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const input = response.locals.validated.body as UpdateProductInput;
  const product = await updateProduct(id, input, request.user!.id, request.ip);
  response.status(200).json({ product });
};

export const deactivateProductController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const product = await deactivateProduct(id, request.user!.id, request.ip);
  response.status(200).json({ product });
};
