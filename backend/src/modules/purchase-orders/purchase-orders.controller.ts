import type { RequestHandler } from "express";
import type {
  CreatePurchaseOrderInput,
  ListPurchaseOrdersQuery,
  ReceivePurchaseOrderInput,
  UpdatePurchaseOrderInput,
} from "./purchase-orders.schema";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  receivePurchaseOrder,
  updatePurchaseOrder,
} from "./purchase-orders.service";

export const createPurchaseOrderController: RequestHandler = async (
  request,
  response,
) => {
  const input = response.locals.validated.body as CreatePurchaseOrderInput;
  const purchaseOrder = await createPurchaseOrder(
    input,
    request.user!,
    request.ip,
  );
  response.status(201).json({ purchaseOrder });
};

export const listPurchaseOrdersController: RequestHandler = async (
  request,
  response,
) => {
  const query = response.locals.validated.query as ListPurchaseOrdersQuery;
  const result = await listPurchaseOrders(query, request.user!);
  response.status(200).json({
    purchaseOrders: result.purchaseOrders,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    },
  });
};

export const getPurchaseOrderController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const purchaseOrder = await getPurchaseOrder(id, request.user!);
  response.status(200).json({ purchaseOrder });
};

export const updatePurchaseOrderController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const input = response.locals.validated.body as UpdatePurchaseOrderInput;
  const purchaseOrder = await updatePurchaseOrder(
    id,
    input,
    request.user!,
    request.ip,
  );
  response.status(200).json({ purchaseOrder });
};

export const approvePurchaseOrderController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const purchaseOrder = await approvePurchaseOrder(
    id,
    request.user!,
    request.ip,
  );
  response.status(200).json({ purchaseOrder });
};

export const receivePurchaseOrderController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const input = response.locals.validated.body as ReceivePurchaseOrderInput;
  const result = await receivePurchaseOrder(
    id,
    input,
    request.user!,
    request.ip,
  );
  response.status(201).json(result);
};

export const cancelPurchaseOrderController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const purchaseOrder = await cancelPurchaseOrder(
    id,
    request.user!,
    request.ip,
  );
  response.status(200).json({ purchaseOrder });
};
