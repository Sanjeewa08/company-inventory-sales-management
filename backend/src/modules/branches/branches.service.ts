import { Prisma, type Branch } from "../../generated/prisma/client";
import { prisma } from "../../prisma/client";
import { AppError } from "../../utils/app-error";
import type { AuthenticatedUser } from "../../middleware/authenticate";
import { writeAuditLog } from "../audit/audit.service";
import type {
  CreateBranchInput,
  ListBranchesQuery,
  UpdateBranchInput,
} from "./branches.schema";

const branchSelect = {
  id: true,
  name: true,
  address: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function auditBranch(branch: Branch): Prisma.InputJsonObject {
  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
    phone: branch.phone,
    isActive: branch.isActive,
    createdAt: branch.createdAt.toISOString(),
    updatedAt: branch.updatedAt.toISOString(),
  };
}

function throwDatabaseError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new AppError(409, "BRANCH_NAME_IN_USE", "Branch name already exists");
  }
  throw error;
}

/** Returns a paginated, role-scoped branch listing. */
export async function listBranches(
  query: ListBranchesQuery,
  user: AuthenticatedUser,
): Promise<{ branches: Branch[]; total: number }> {
  const where: Prisma.BranchWhereInput = {
    isActive: query.isActive,
    ...(query.name
      ? { name: { contains: query.name, mode: "insensitive" } }
      : {}),
    ...(user.role === "ADMIN" || user.role === "MANAGER"
      ? {}
      : { id: user.branchId ?? { in: [] } }),
  };
  const [branches, total] = await prisma.$transaction([
    prisma.branch.findMany({
      where,
      select: branchSelect,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.branch.count({ where }),
  ]);
  return { branches, total };
}

/** Creates a branch and records the creation in the audit log. */
export async function createBranch(
  input: CreateBranchInput,
  actorId: string,
  ip: string | undefined,
): Promise<Branch> {
  try {
    return await prisma.$transaction(async (transaction) => {
      const branch = await transaction.branch.create({
        data: {
          name: input.name,
          address: input.address ?? null,
          phone: input.phone ?? null,
        },
        select: branchSelect,
      });
      await writeAuditLog(
        {
          userId: actorId,
          action: "CREATE",
          entity: "Branch",
          entityId: branch.id,
          after: auditBranch(branch),
          ip,
        },
        transaction,
      );
      return branch;
    });
  } catch (error) {
    throwDatabaseError(error);
  }
}

/** Updates a branch and audits its sanitized before/after state. */
export async function updateBranch(
  id: string,
  input: UpdateBranchInput,
  actorId: string,
  ip: string | undefined,
): Promise<Branch> {
  try {
    return await prisma.$transaction(async (transaction) => {
      const before = await transaction.branch.findUnique({
        where: { id },
        select: branchSelect,
      });
      if (!before) {
        throw new AppError(404, "BRANCH_NOT_FOUND", "Branch not found");
      }
      const after = await transaction.branch.update({
        where: { id },
        data: input,
        select: branchSelect,
      });
      await writeAuditLog(
        {
          userId: actorId,
          action: "UPDATE",
          entity: "Branch",
          entityId: id,
          before: auditBranch(before),
          after: auditBranch(after),
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

/** Soft-deactivates a branch without breaking its existing relations. */
export async function deactivateBranch(
  id: string,
  actorId: string,
  ip: string | undefined,
): Promise<Branch> {
  return prisma.$transaction(async (transaction) => {
    const before = await transaction.branch.findUnique({
      where: { id },
      select: branchSelect,
    });
    if (!before) {
      throw new AppError(404, "BRANCH_NOT_FOUND", "Branch not found");
    }
    const after = await transaction.branch.update({
      where: { id },
      data: { isActive: false },
      select: branchSelect,
    });
    await writeAuditLog(
      {
        userId: actorId,
        action: "DELETE",
        entity: "Branch",
        entityId: id,
        before: auditBranch(before),
        after: auditBranch(after),
        ip,
      },
      transaction,
    );
    return after;
  });
}
