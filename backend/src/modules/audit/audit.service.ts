import { Prisma, type AuditAction } from "../../generated/prisma/client";
import type { PrismaClient } from "../../generated/prisma/client";
import { prisma } from "../../prisma/client";

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
