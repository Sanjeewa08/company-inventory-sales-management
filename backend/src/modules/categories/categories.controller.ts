import type { RequestHandler } from "express";
import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from "./categories.schema";
import {
  createCategory,
  deactivateCategory,
  listCategories,
  updateCategory,
} from "./categories.service";

export const listCategoriesController: RequestHandler = async (
  _request,
  response,
) => {
  const query = response.locals.validated.query as ListCategoriesQuery;
  const result = await listCategories(query);
  response.status(200).json({
    categories: result.categories,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    },
  });
};

export const createCategoryController: RequestHandler = async (
  request,
  response,
) => {
  const input = response.locals.validated.body as CreateCategoryInput;
  const category = await createCategory(input, request.user!.id, request.ip);
  response.status(201).json({ category });
};

export const updateCategoryController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const input = response.locals.validated.body as UpdateCategoryInput;
  const category = await updateCategory(
    id,
    input,
    request.user!.id,
    request.ip,
  );
  response.status(200).json({ category });
};

export const deactivateCategoryController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const category = await deactivateCategory(id, request.user!.id, request.ip);
  response.status(200).json({ category });
};
