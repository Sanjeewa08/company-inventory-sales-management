import { Prisma, type AuditAction } from "../../generated/prisma/client";
import type { PrismaClient } from "../../generated/prisma/client";
import { prisma } from "../../prisma/client";
import type { ListAuditLogsQuery } from "./audit.schema";

type AuditWriter = Pick<PrismaClient, "auditLog">;

export interface AuditEntry {
  userId?: string | null;
  action: AuditAction;
  entity: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string | null;
}

export async function writeAuditLog(
  entry: AuditEntry,
  writer: AuditWriter = prisma,
): Promise<void> {
  await writer.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      ...(entry.before === undefined ? {} : { before: entry.before }),
      ...(entry.after === undefined ? {} : { after: entry.after }),
      ip: entry.ip ?? null,
    },
  });
}

const auditLogSelect = {
  id: true,
  userId: true,
  action: true,
  entity: true,
  entityId: true,
  before: true,
  after: true,
  ip: true,
  createdAt: true,
  user: {
    select: { id: true, name: true, email: true },
  },
} satisfies Prisma.AuditLogSelect;

/** Returns filtered and paginated audit entries. */
export async function listAuditLogs(query: ListAuditLogsQuery): Promise<{
  auditLogs: Prisma.AuditLogGetPayload<{ select: typeof auditLogSelect }>[];
  total: number;
}> {
  const where: Prisma.AuditLogWhereInput = {
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.entity ? { entity: query.entity } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(query.startDate || query.endDate
      ? {
          createdAt: {
            ...(query.startDate ? { gte: query.startDate } : {}),
            ...(query.endDate ? { lte: query.endDate } : {}),
          },
        }
      : {}),
  };
  const [auditLogs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      select: auditLogSelect,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { auditLogs, total };
}
