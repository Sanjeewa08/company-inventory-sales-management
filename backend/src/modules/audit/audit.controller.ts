import type { RequestHandler } from "express";
import type { ListAuditLogsQuery } from "./audit.schema";
import { listAuditLogs } from "./audit.service";

export const listAuditLogsController: RequestHandler = async (
  request,
  response,
) => {
  const query = response.locals.validated.query as ListAuditLogsQuery;
  const result = await listAuditLogs(query);
  response.status(200).json({
    auditLogs: result.auditLogs,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    },
  });
};
