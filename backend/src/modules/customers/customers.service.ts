import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../prisma/client";
import { AppError } from "../../utils/app-error";
import { writeAuditLog } from "../audit/audit.service";
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from "./customers.schema";

const customerSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  taxNumber: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerSelect;

type CustomerRecord = Prisma.CustomerGetPayload<{
  select: typeof customerSelect;
}>;

function auditCustomer(customer: CustomerRecord): Prisma.InputJsonObject {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    taxNumber: customer.taxNumber,
    isActive: customer.isActive,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function throwDatabaseError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new AppError(
      409,
      "CUSTOMER_EMAIL_ALREADY_EXISTS",
      "A customer with this email already exists",
    );
  }
  throw error;
}

/** Returns a filtered and paginated customer listing. */
export async function listCustomers(
  query: ListCustomersQuery,
): Promise<{ customers: CustomerRecord[]; total: number }> {
  const where: Prisma.CustomerWhereInput = {
    isActive: query.isActive,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
            { phone: { contains: query.search, mode: "insensitive" } },
            { taxNumber: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [customers, total] = await prisma.$transaction([
    prisma.customer.findMany({
      where,
      select: customerSelect,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.customer.count({ where }),
  ]);
  return { customers, total };
}

/** Retrieves a customer by ID, including deactivated records. */
export async function getCustomer(id: string): Promise<CustomerRecord> {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: customerSelect,
  });
  if (!customer) {
    throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found");
  }
  return customer;
}

/** Creates a customer and records the creation in the audit log. */
export async function createCustomer(
  input: CreateCustomerInput,
  actorId: string,
  ip: string | undefined,
): Promise<CustomerRecord> {
  try {
    return await prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.create({
        data: {
          ...input,
          email: input.email ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          taxNumber: input.taxNumber ?? null,
        },
        select: customerSelect,
      });
      await writeAuditLog(
        {
          userId: actorId,
          action: "CREATE",
          entity: "Customer",
          entityId: customer.id,
          after: auditCustomer(customer),
          ip,
        },
        transaction,
      );
      return customer;
    });
  } catch (error) {
    throwDatabaseError(error);
  }
}

/** Updates a customer and audits its before/after state. */
export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
  actorId: string,
  ip: string | undefined,
): Promise<CustomerRecord> {
  try {
    return await prisma.$transaction(async (transaction) => {
      const before = await transaction.customer.findUnique({
        where: { id },
        select: customerSelect,
      });
      if (!before) {
        throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found");
      }
      const after = await transaction.customer.update({
        where: { id },
        data: {
          ...input,
          ...(input.email === undefined ? {} : { email: input.email ?? null }),
        },
        select: customerSelect,
      });
      await writeAuditLog(
        {
          userId: actorId,
          action: "UPDATE",
          entity: "Customer",
          entityId: id,
          before: auditCustomer(before),
          after: auditCustomer(after),
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

/** Deactivates a customer while preserving quotation and invoice references. */
export async function deactivateCustomer(
  id: string,
  actorId: string,
  ip: string | undefined,
): Promise<CustomerRecord> {
  return prisma.$transaction(async (transaction) => {
    const before = await transaction.customer.findUnique({
      where: { id },
      select: customerSelect,
    });
    if (!before) {
      throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found");
    }
    const after = await transaction.customer.update({
      where: { id },
      data: { isActive: false },
      select: customerSelect,
    });
    await writeAuditLog(
      {
        userId: actorId,
        action: "DELETE",
        entity: "Customer",
        entityId: id,
        before: auditCustomer(before),
        after: auditCustomer(after),
        ip,
      },
      transaction,
    );
    return after;
  });
}
