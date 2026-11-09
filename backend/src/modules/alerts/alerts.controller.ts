import type { RequestHandler } from "express";
import type { ListLowStockAlertsQuery } from "./alerts.schema";
import { acknowledgeLowStockAlert, listLowStockAlerts } from "./alerts.service";

export const listLowStockAlertsController: RequestHandler = async (
  request,
  response,
) => {
  const query = response.locals.validated.query as ListLowStockAlertsQuery;
  const result = await listLowStockAlerts(query, request.user!);
  response.status(200).json({
    alerts: result.alerts,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    },
  });
};

export const acknowledgeLowStockAlertController: RequestHandler = async (
  request,
  response,
) => {
  const { id } = response.locals.validated.params as { id: string };
  const alert = await acknowledgeLowStockAlert(id, request.user!, request.ip);
  response.status(200).json({ alert });
};
