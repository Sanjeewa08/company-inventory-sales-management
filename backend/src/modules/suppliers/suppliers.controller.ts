import type { RequestHandler } from "express";
import type {
  CreateSupplierInput,
  ListSuppliersQuery,
  UpdateSupplierInput,
} from "./suppliers.schema";
import {
  createSupplier,
  deactivateSupplier,
  getSupplier,
  listSuppliers,
  updateSupplier,
} from "./suppliers.service";

export const listSuppliersController: RequestHandler = async (
  _request,
  response,
) => {
  const query = response.locals.validated.query as ListSuppliersQuery;
  const result = await listSuppliers(query);
  response.status(200).json({
    suppliers: result.suppliers,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    },
  });
};

export const getSupplierController: RequestHandler = async (
  _request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  response.status(200).json({ supplier: await getSupplier(id) });
};

export const createSupplierController: RequestHandler = async (
  request,
  response,
) => {
  const input = response.locals.validated.body as CreateSupplierInput;
  const supplier = await createSupplier(input, request.user!.id, request.ip);
  response.status(201).json({ supplier });
};

export const updateSupplierController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const input = response.locals.validated.body as UpdateSupplierInput;
  const supplier = await updateSupplier(
    id,
    input,
    request.user!.id,
    request.ip,
  );
  response.status(200).json({ supplier });
};

export const deactivateSupplierController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const supplier = await deactivateSupplier(id, request.user!.id, request.ip);
  response.status(200).json({ supplier });
};
