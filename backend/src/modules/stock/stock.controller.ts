import type { RequestHandler } from "express";
import type {
  AdjustStockInput,
  ListStockQuery,
  TransferStockInput,
} from "./stock.schema";
import { adjustStock, listStock, transferStock } from "./stock.service";

export const listStockController: RequestHandler = async (
  request,
  response,
) => {
  const query = response.locals.validated.query as ListStockQuery;
  const result = await listStock(query, request.user!);
  response.status(200).json({
    stock: result.stock,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    },
  });
};

export const adjustStockController: RequestHandler = async (
  request,
  response,
) => {
  const input = response.locals.validated.body as AdjustStockInput;
  const stock = await adjustStock(input, request.user!, request.ip);
  response.status(200).json({ stock });
};

export const transferStockController: RequestHandler = async (
  request,
  response,
) => {
  const input = response.locals.validated.body as TransferStockInput;
  const transfer = await transferStock(input, request.user!, request.ip);
  response.status(201).json({ transfer });
};
