import type { RequestHandler } from "express";
import type { CreateInvoiceInput, ListInvoicesQuery } from "./invoices.schema";
import {
  cancelInvoice,
  createInvoice,
  getInvoice,
  listInvoices,
} from "./invoices.service";

export const createInvoiceController: RequestHandler = async (
  request,
  response,
) => {
  const input = response.locals.validated.body as CreateInvoiceInput;
  const invoice = await createInvoice(input, request.user!, request.ip);
  response.status(201).json({ invoice });
};

export const listInvoicesController: RequestHandler = async (
  request,
  response,
) => {
  const query = response.locals.validated.query as ListInvoicesQuery;
  const result = await listInvoices(query, request.user!);
  response.status(200).json({
    invoices: result.invoices,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    },
  });
};

export const getInvoiceController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const invoice = await getInvoice(id, request.user!);
  response.status(200).json({ invoice });
};

export const cancelInvoiceController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const invoice = await cancelInvoice(id, request.user!, request.ip);
  response.status(200).json({ invoice });
};
