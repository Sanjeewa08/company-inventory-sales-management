import { Prisma, type Product } from "../../generated/prisma/client";
import { prisma } from "../../prisma/client";
import { AppError } from "../../utils/app-error";
import { writeAuditLog } from "../audit/audit.service";
import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from "./products.schema";

const productSelect = {
  id: true,
  sku: true,
  name: true,
  description: true,
  unit: true,
  categoryId: true,
  costPrice: true,
  sellingPrice: true,
  reorderLevel: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function auditProduct(product: Product): Prisma.InputJsonObject {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    unit: product.unit,
    categoryId: product.categoryId,
    costPrice: product.costPrice.toString(),
    sellingPrice: product.sellingPrice.toString(),
    reorderLevel: product.reorderLevel,
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function throwDatabaseError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      throw new AppError(
        409,
        "PRODUCT_SKU_IN_USE",
        "Product SKU already exists",
      );
    }
    if (error.code === "P2003") {
      throw new AppError(400, "CATEGORY_NOT_FOUND", "Category does not exist");
    }
  }
  throw error;
}

/** Returns a filtered and paginated product listing. */
export async function listProducts(
  query: ListProductsQuery,
): Promise<{ products: Product[]; total: number }> {
  const where: Prisma.ProductWhereInput = {
    isActive: query.isActive,
    ...(query.name
      ? { name: { contains: query.name, mode: "insensitive" } }
      : {}),
    ...(query.sku ? { sku: { contains: query.sku, mode: "insensitive" } } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
  };
  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      select: productSelect,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.product.count({ where }),
  ]);
  return { products, total };
}

/** Creates an active-category product and records its audited state. */
export async function createProduct(
  input: CreateProductInput,
  actorId: string,
  ip: string | undefined,
): Promise<Product> {
  try {
    return await prisma.$transaction(async (transaction) => {
      const category = await transaction.category.findFirst({
        where: { id: input.categoryId, isActive: true },
        select: { id: true },
      });
      if (!category) {
        throw new AppError(
          400,
          "CATEGORY_NOT_FOUND",
          "Active category not found",
        );
      }
      const product = await transaction.product.create({
        data: {
          ...input,
          costPrice: new Prisma.Decimal(input.costPrice),
          sellingPrice: new Prisma.Decimal(input.sellingPrice),
        },
        select: productSelect,
      });
      await writeAuditLog(
        {
          userId: actorId,
          action: "CREATE",
          entity: "Product",
          entityId: product.id,
          after: auditProduct(product),
          ip,
        },
        transaction,
      );
      return product;
    });
  } catch (error) {
    throwDatabaseError(error);
  }
}

/** Updates a product and audits its sanitized before/after state. */
export async function updateProduct(
  id: string,
  input: UpdateProductInput,
  actorId: string,
  ip: string | undefined,
): Promise<Product> {
  try {
    return await prisma.$transaction(async (transaction) => {
      const before = await transaction.product.findUnique({
        where: { id },
        select: productSelect,
      });
      if (!before) {
        throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
      }
      if (input.categoryId) {
        const category = await transaction.category.findFirst({
          where: { id: input.categoryId, isActive: true },
          select: { id: true },
        });
        if (!category) {
          throw new AppError(
            400,
            "CATEGORY_NOT_FOUND",
            "Active category not found",
          );
        }
      }
      const after = await transaction.product.update({
        where: { id },
        data: {
          ...input,
          ...(input.costPrice === undefined
            ? {}
            : { costPrice: new Prisma.Decimal(input.costPrice) }),
          ...(input.sellingPrice === undefined
            ? {}
            : { sellingPrice: new Prisma.Decimal(input.sellingPrice) }),
        },
        select: productSelect,
      });
      await writeAuditLog(
        {
          userId: actorId,
          action: "UPDATE",
          entity: "Product",
          entityId: id,
          before: auditProduct(before),
          after: auditProduct(after),
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

/** Soft-deactivates a product while preserving stock and document history. */
export async function deactivateProduct(
  id: string,
  actorId: string,
  ip: string | undefined,
): Promise<Product> {
  return prisma.$transaction(async (transaction) => {
    const before = await transaction.product.findUnique({
      where: { id },
      select: productSelect,
    });
    if (!before) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }
    const after = await transaction.product.update({
      where: { id },
      data: { isActive: false },
      select: productSelect,
    });
    await writeAuditLog(
      {
        userId: actorId,
        action: "DELETE",
        entity: "Product",
        entityId: id,
        before: auditProduct(before),
        after: auditProduct(after),
        ip,
      },
      transaction,
    );
    return after;
  });
}
