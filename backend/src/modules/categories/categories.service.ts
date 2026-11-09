import { Prisma, type Category } from "../../generated/prisma/client";
import { prisma } from "../../prisma/client";
import { AppError } from "../../utils/app-error";
import { writeAuditLog } from "../audit/audit.service";
import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from "./categories.schema";

const categorySelect = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function auditCategory(category: Category): Prisma.InputJsonObject {
  return {
    id: category.id,
    name: category.name,
    description: category.description,
    isActive: category.isActive,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

function throwDatabaseError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new AppError(
      409,
      "CATEGORY_NAME_IN_USE",
      "Category name already exists",
    );
  }
  throw error;
}

/** Returns a filtered and paginated category listing. */
export async function listCategories(
  query: ListCategoriesQuery,
): Promise<{ categories: Category[]; total: number }> {
  const where: Prisma.CategoryWhereInput = {
    isActive: query.isActive,
    ...(query.name
      ? { name: { contains: query.name, mode: "insensitive" } }
      : {}),
  };
  const [categories, total] = await prisma.$transaction([
    prisma.category.findMany({
      where,
      select: categorySelect,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.category.count({ where }),
  ]);
  return { categories, total };
}

/** Creates a category and records the creation in the audit log. */
export async function createCategory(
  input: CreateCategoryInput,
  actorId: string,
  ip: string | undefined,
): Promise<Category> {
  try {
    return await prisma.$transaction(async (transaction) => {
      const category = await transaction.category.create({
        data: {
          name: input.name,
          description: input.description ?? null,
        },
        select: categorySelect,
      });
      await writeAuditLog(
        {
          userId: actorId,
          action: "CREATE",
          entity: "Category",
          entityId: category.id,
          after: auditCategory(category),
          ip,
        },
        transaction,
      );
      return category;
    });
  } catch (error) {
    throwDatabaseError(error);
  }
}

/** Updates a category and audits its sanitized before/after state. */
export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
  actorId: string,
  ip: string | undefined,
): Promise<Category> {
  try {
    return await prisma.$transaction(async (transaction) => {
      const before = await transaction.category.findUnique({
        where: { id },
        select: categorySelect,
      });
      if (!before) {
        throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
      }
      const after = await transaction.category.update({
        where: { id },
        data: input,
        select: categorySelect,
      });
      await writeAuditLog(
        {
          userId: actorId,
          action: "UPDATE",
          entity: "Category",
          entityId: id,
          before: auditCategory(before),
          after: auditCategory(after),
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

/** Soft-deactivates a category while preserving product references. */
export async function deactivateCategory(
  id: string,
  actorId: string,
  ip: string | undefined,
): Promise<Category> {
  return prisma.$transaction(async (transaction) => {
    const before = await transaction.category.findUnique({
      where: { id },
      select: categorySelect,
    });
    if (!before) {
      throw new AppError(404, "CATEGORY_NOT_FOUND", "Category not found");
    }
    const after = await transaction.category.update({
      where: { id },
      data: { isActive: false },
      select: categorySelect,
    });
    await writeAuditLog(
      {
        userId: actorId,
        action: "DELETE",
        entity: "Category",
        entityId: id,
        before: auditCategory(before),
        after: auditCategory(after),
        ip,
      },
      transaction,
    );
    return after;
  });
}
