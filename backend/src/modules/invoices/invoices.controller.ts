import type { RequestHandler } from "express";
import type {
  CreateInvoiceInput,
  CreatePaymentInput,
  ListInvoicesQuery,
} from "./invoices.schema";
import {
  cancelInvoice,
  createInvoicePayment,
  createInvoice,
  getInvoice,
  getInvoicePdf,
  listInvoicePayments,
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

export const createInvoicePaymentController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const input = response.locals.validated.body as CreatePaymentInput;
  const result = await createInvoicePayment(
    id,
    input,
    request.user!,
    request.ip,
  );
  response.status(201).json(result);
};

export const listInvoicePaymentsController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const payments = await listInvoicePayments(id, request.user!);
  response.status(200).json({ payments });
};

export const getInvoicePdfController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const pdf = await getInvoicePdf(id, request.user!);
  response
    .status(200)
    .type("application/pdf")
    .set("Content-Disposition", `inline; filename="${pdf.filename}"`)
    .send(pdf.buffer);
};
