import bcrypt from "bcryptjs";
import { Prisma } from "../../generated/prisma/client";
import type { SafeUser } from "../auth/auth.service";
import { prisma } from "../../prisma/client";
import { writeAuditLog } from "../audit/audit.service";
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
} from "./users.schema";
import { AppError } from "../../utils/app-error";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  branchId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function auditUser(user: SafeUser): Prisma.InputJsonObject {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    branchId: user.branchId,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function mapDatabaseError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new AppError(
      409,
      "EMAIL_IN_USE",
      "A user with this email already exists",
    );
  }
  throw error;
}

export async function createUser(
  input: CreateUserInput,
  actorId: string,
  ip: string | undefined,
): Promise<SafeUser> {
  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    return await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          role: input.role,
          branchId: input.branchId ?? null,
        },
        select: userSelect,
      });
      await writeAuditLog(
        {
          userId: actorId,
          action: "CREATE",
          entity: "User",
          entityId: user.id,
          after: auditUser(user),
          ip,
        },
        transaction,
      );
      return user;
    });
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function listUsers(
  query: ListUsersQuery,
): Promise<{ users: SafeUser[]; page: number; limit: number; total: number }> {
  const where: Prisma.UserWhereInput = {
    ...(query.name
      ? { name: { contains: query.name, mode: "insensitive" } }
      : {}),
    ...(query.email
      ? { email: { contains: query.email.toLowerCase(), mode: "insensitive" } }
      : {}),
    ...(query.role ? { role: query.role } : {}),
    ...(query.branchId ? { branchId: query.branchId } : {}),
    ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
  };
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.user.count({ where }),
  ]);
  return { users, page: query.page, limit: query.limit, total };
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actorId: string,
  ip: string | undefined,
): Promise<SafeUser> {
  try {
    return await prisma.$transaction(async (transaction) => {
      const before = await transaction.user.findUnique({
        where: { id },
        select: userSelect,
      });
      if (!before) {
        throw new AppError(404, "USER_NOT_FOUND", "User not found");
      }
      const after = await transaction.user.update({
        where: { id },
        data: input,
        select: userSelect,
      });
      await writeAuditLog(
        {
          userId: actorId,
          action: "UPDATE",
          entity: "User",
          entityId: id,
          before: auditUser(before),
          after: auditUser(after),
          ip,
        },
        transaction,
      );
      return after;
    });
  } catch (error) {
    mapDatabaseError(error);
  }
}

export async function deactivateUser(
  id: string,
  actorId: string,
  ip: string | undefined,
): Promise<SafeUser> {
  return prisma.$transaction(async (transaction) => {
    const before = await transaction.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!before) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found");
    }
    const after = await transaction.user.update({
      where: { id },
      data: { isActive: false },
      select: userSelect,
    });
    await writeAuditLog(
      {
        userId: actorId,
        action: "DELETE",
        entity: "User",
        entityId: id,
        before: auditUser(before),
        after: auditUser(after),
        ip,
      },
      transaction,
    );
    return after;
  });
}
