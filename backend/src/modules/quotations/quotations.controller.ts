import type { RequestHandler } from "express";
import type {
  CreateQuotationInput,
  ListQuotationsQuery,
  UpdateQuotationInput,
} from "./quotations.schema";
import {
  acceptQuotation,
  createQuotation,
  expireQuotation,
  getQuotation,
  listQuotations,
  prepareInvoicePayloadFromQuotation,
  sendQuotation,
  updateQuotation,
} from "./quotations.service";

export const listQuotationsController: RequestHandler = async (
  request,
  response,
) => {
  const query = response.locals.validated.query as ListQuotationsQuery;
  const result = await listQuotations(query, request.user!);
  response.status(200).json({
    quotations: result.quotations,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    },
  });
};

export const getQuotationController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const quotation = await getQuotation(id, request.user!);
  response.status(200).json({ quotation });
};

export const createQuotationController: RequestHandler = async (
  request,
  response,
) => {
  const input = response.locals.validated.body as CreateQuotationInput;
  const quotation = await createQuotation(input, request.user!, request.ip);
  response.status(201).json({ quotation });
};

export const updateQuotationController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const input = response.locals.validated.body as UpdateQuotationInput;
  const quotation = await updateQuotation(id, input, request.user!, request.ip);
  response.status(200).json({ quotation });
};

export const sendQuotationController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const quotation = await sendQuotation(id, request.user!, request.ip);
  response.status(200).json({ quotation });
};

export const acceptQuotationController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const quotation = await acceptQuotation(id, request.user!, request.ip);
  response.status(200).json({ quotation });
};

export const expireQuotationController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const quotation = await expireQuotation(id, request.user!, request.ip);
  response.status(200).json({ quotation });
};

export const convertQuotationController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const invoicePayload = await prepareInvoicePayloadFromQuotation(
    id,
    request.user!,
  );
  response.status(200).json({ invoicePayload });
};
