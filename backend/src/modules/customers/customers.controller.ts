import type { RequestHandler } from "express";
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from "./customers.schema";
import {
  createCustomer,
  deactivateCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from "./customers.service";

export const listCustomersController: RequestHandler = async (
  _request,
  response,
) => {
  const query = response.locals.validated.query as ListCustomersQuery;
  const result = await listCustomers(query);
  response.status(200).json({
    customers: result.customers,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    },
  });
};

export const getCustomerController: RequestHandler = async (
  _request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  response.status(200).json({ customer: await getCustomer(id) });
};

export const createCustomerController: RequestHandler = async (
  request,
  response,
) => {
  const input = response.locals.validated.body as CreateCustomerInput;
  const customer = await createCustomer(input, request.user!.id, request.ip);
  response.status(201).json({ customer });
};

export const updateCustomerController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const input = response.locals.validated.body as UpdateCustomerInput;
  const customer = await updateCustomer(
    id,
    input,
    request.user!.id,
    request.ip,
  );
  response.status(200).json({ customer });
};

export const deactivateCustomerController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const customer = await deactivateCustomer(id, request.user!.id, request.ip);
  response.status(200).json({ customer });
};
