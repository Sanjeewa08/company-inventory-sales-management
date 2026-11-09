import { Prisma, type Supplier } from "../../generated/prisma/client";
import { prisma } from "../../prisma/client";
import { AppError } from "../../utils/app-error";
import { writeAuditLog } from "../audit/audit.service";
import type {
  CreateSupplierInput,
  ListSuppliersQuery,
  UpdateSupplierInput,
} from "./suppliers.schema";

const supplierSelect = {
  id: true,
  name: true,
  contactName: true,
  email: true,
  phone: true,
  address: true,
  taxNumber: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function auditSupplier(supplier: Supplier): Prisma.InputJsonObject {
  return {
    id: supplier.id,
    name: supplier.name,
    contactName: supplier.contactName,
    email: supplier.email,
    phone: supplier.phone,
    address: supplier.address,
    taxNumber: supplier.taxNumber,
    isActive: supplier.isActive,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
  };
}

function throwDatabaseError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new AppError(
      409,
      "SUPPLIER_ALREADY_EXISTS",
      "Supplier name or email already exists",
    );
  }
  throw error;
}

/** Returns a filtered and paginated supplier listing. */
export async function listSuppliers(
  query: ListSuppliersQuery,
): Promise<{ suppliers: Supplier[]; total: number }> {
  const where: Prisma.SupplierWhereInput = {
    isActive: query.isActive,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { contactName: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
            { taxNumber: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [suppliers, total] = await prisma.$transaction([
    prisma.supplier.findMany({
      where,
      select: supplierSelect,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.supplier.count({ where }),
  ]);
  return { suppliers, total };
}

/** Retrieves a supplier by ID. */
export async function getSupplier(id: string): Promise<Supplier> {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    select: supplierSelect,
  });
  if (!supplier) {
    throw new AppError(404, "SUPPLIER_NOT_FOUND", "Supplier not found");
  }
  return supplier;
}

/** Creates a supplier and records the creation in the audit log. */
export async function createSupplier(
  input: CreateSupplierInput,
  actorId: string,
  ip: string | undefined,
): Promise<Supplier> {
  try {
    return await prisma.$transaction(async (transaction) => {
      const supplier = await transaction.supplier.create({
        data: {
          ...input,
          email: input.email ?? null,
          contactName: input.contactName ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          taxNumber: input.taxNumber ?? null,
        },
        select: supplierSelect,
      });
      await writeAuditLog(
        {
          userId: actorId,
          action: "CREATE",
          entity: "Supplier",
          entityId: supplier.id,
          after: auditSupplier(supplier),
          ip,
        },
        transaction,
      );
      return supplier;
    });
  } catch (error) {
    throwDatabaseError(error);
  }
}

/** Updates a supplier and audits its before/after state. */
export async function updateSupplier(
  id: string,
  input: UpdateSupplierInput,
  actorId: string,
  ip: string | undefined,
): Promise<Supplier> {
  try {
    return await prisma.$transaction(async (transaction) => {
      const before = await transaction.supplier.findUnique({
        where: { id },
        select: supplierSelect,
      });
      if (!before) {
        throw new AppError(404, "SUPPLIER_NOT_FOUND", "Supplier not found");
      }
      const after = await transaction.supplier.update({
        where: { id },
        data: {
          ...input,
          ...(input.email === undefined ? {} : { email: input.email ?? null }),
        },
        select: supplierSelect,
      });
      await writeAuditLog(
        {
          userId: actorId,
          action: "UPDATE",
          entity: "Supplier",
          entityId: id,
          before: auditSupplier(before),
          after: auditSupplier(after),
          ip,
        },
        transaction,
      );
      return after;
    });
  } catch (error) {
    throwDatabaseError(error);
  }
}

/** Soft-deactivates a supplier while preserving purchase-order references. */
export async function deactivateSupplier(
  id: string,
  actorId: string,
  ip: string | undefined,
): Promise<Supplier> {
  return prisma.$transaction(async (transaction) => {
    const before = await transaction.supplier.findUnique({
      where: { id },
      select: supplierSelect,
    });
    if (!before) {
      throw new AppError(404, "SUPPLIER_NOT_FOUND", "Supplier not found");
    }
    const after = await transaction.supplier.update({
      where: { id },
      data: { isActive: false },
      select: supplierSelect,
    });
    await writeAuditLog(
      {
        userId: actorId,
        action: "DELETE",
        entity: "Supplier",
        entityId: id,
        before: auditSupplier(before),
        after: auditSupplier(after),
        ip,
      },
      transaction,
    );
    return after;
  });
}
