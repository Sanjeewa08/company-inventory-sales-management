import cron, { type ScheduledTask } from "node-cron";
import { Prisma } from "../../generated/prisma/client";
import type { AuthenticatedUser } from "../../middleware/authenticate";
import { prisma } from "../../prisma/client";
import { AppError } from "../../utils/app-error";
import { writeAuditLog } from "../audit/audit.service";
import { refreshLowStockAlert } from "../stock/stock.service";
import type { ListLowStockAlertsQuery } from "./alerts.schema";

const alertSelect = {
  id: true,
  branchId: true,
  productId: true,
  type: true,
  message: true,
  isRead: true,
  resolvedAt: true,
  resolvedById: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { id: true, name: true } },
  product: {
    select: { id: true, sku: true, name: true, unit: true, reorderLevel: true },
  },
} satisfies Prisma.AlertSelect;

type AlertRecord = Prisma.AlertGetPayload<{ select: typeof alertSelect }>;

function assertBranchAccess(user: AuthenticatedUser, branchId: string): void {
  if (user.role === "ADMIN") return;
  if (!user.branchId) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "A branch must be assigned to this user",
    );
  }
  if (branchId !== user.branchId) {
    throw new AppError(403, "FORBIDDEN", "Access to this branch is forbidden");
  }
}

function auditAlert(alert: AlertRecord): Prisma.InputJsonObject {
  return {
    id: alert.id,
    branchId: alert.branchId,
    productId: alert.productId,
    type: alert.type,
    message: alert.message,
    isRead: alert.isRead,
    resolvedAt: alert.resolvedAt?.toISOString() ?? null,
    resolvedById: alert.resolvedById,
  };
}

/** Lists active low-stock alerts, restricting non-admin users to their branch. */
export async function listLowStockAlerts(
  query: ListLowStockAlertsQuery,
  user: AuthenticatedUser,
): Promise<{ alerts: AlertRecord[]; total: number }> {
  let branchId = query.branchId;
  if (user.role !== "ADMIN") {
    if (!user.branchId) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "A branch must be assigned to this user",
      );
    }
    if (branchId && branchId !== user.branchId) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Access to this branch is forbidden",
      );
    }
    branchId = user.branchId;
  }

  const where: Prisma.AlertWhereInput = {
    type: "LOW_STOCK",
    resolvedAt: null,
    ...(branchId ? { branchId } : {}),
    ...(query.acknowledged === undefined ? {} : { isRead: query.acknowledged }),
  };
  const [alerts, total] = await prisma.$transaction([
    prisma.alert.findMany({
      where,
      select: alertSelect,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.alert.count({ where }),
  ]);
  return { alerts, total };
}

/** Marks an alert as acknowledged and records the change in the audit log. */
export async function acknowledgeLowStockAlert(
  id: string,
  user: AuthenticatedUser,
  ip: string | undefined,
): Promise<AlertRecord> {
  return prisma.$transaction(async (transaction) => {
    const before = await transaction.alert.findUnique({
      where: { id },
      select: alertSelect,
    });
    if (!before) {
      throw new AppError(404, "ALERT_NOT_FOUND", "Alert not found");
    }
    assertBranchAccess(user, before.branchId);
    if (before.isRead) return before;

    const after = await transaction.alert.update({
      where: { id },
      data: { isRead: true },
      select: alertSelect,
    });
    await writeAuditLog(
      {
        userId: user.id,
        action: "UPDATE",
        entity: "Alert",
        entityId: id,
        before: auditAlert(before),
        after: auditAlert(after),
        ip,
      },
      transaction,
    );
    return after;
  });
}

/** Reconciles every stock row with its product reorder level in one transaction. */
export async function refreshAllLowStockAlerts(): Promise<{
  checked: number;
  lowStock: number;
  resolved: number;
}> {
  return prisma.$transaction(async (transaction) => {
    const stockRows = await transaction.stock.findMany({
      select: {
        branchId: true,
        productId: true,
        quantity: true,
        product: {
          select: { id: true, name: true, reorderLevel: true },
        },
      },
    });
    let lowStock = 0;
    let resolved = 0;
    for (const stock of stockRows) {
      const result = await refreshLowStockAlert(
        transaction,
        stock.branchId,
        stock.product,
        stock.quantity,
        null,
      );
      if (result.lowStock) lowStock += 1;
      resolved += result.resolved;
    }
    return { checked: stockRows.length, lowStock, resolved };
  });
}

/** Starts the configured low-stock reconciliation schedule. */
export function startLowStockAlertJob(schedule: string): ScheduledTask {
  if (!cron.validate(schedule)) {
    throw new Error("LOW_STOCK_ALERT_CRON must be a valid cron expression");
  }
  return cron.schedule(schedule, async () => {
    try {
      const result = await refreshAllLowStockAlerts();
      console.info("Low-stock alert reconciliation completed", result);
    } catch (error) {
      console.error("Low-stock alert reconciliation failed", error);
    }
  });
}
