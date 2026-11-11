import { createBranchSchema } from "../src/modules/branches/branches.schema";
import { createCategorySchema } from "../src/modules/categories/categories.schema";
import { createCustomerSchema } from "../src/modules/customers/customers.schema";
import { createProductSchema } from "../src/modules/products/products.schema";
import { createSupplierSchema } from "../src/modules/suppliers/suppliers.schema";
import {
  demoBranches,
  demoCategories,
  demoCustomers,
  demoProducts,
  demoSuppliers,
  productionDemoRecordCounts,
} from "../prisma/production-demo-fixtures";

describe("production demonstration fixtures", () => {
  it("matches the approved dataset counts and has unique reserved identifiers", () => {
    expect(demoBranches).toHaveLength(productionDemoRecordCounts.branches);
    expect(demoCategories).toHaveLength(productionDemoRecordCounts.categories);
    expect(demoSuppliers).toHaveLength(productionDemoRecordCounts.suppliers);
    expect(demoCustomers).toHaveLength(productionDemoRecordCounts.customers);
    expect(demoProducts).toHaveLength(productionDemoRecordCounts.products);
    expect(
      productionDemoRecordCounts.branches * productionDemoRecordCounts.products,
    ).toBe(productionDemoRecordCounts.stockRows);
    expect(new Set(demoProducts.map((product) => product.sku)).size).toBe(
      demoProducts.length,
    );
    expect(new Set(demoSuppliers.map((supplier) => supplier.email)).size).toBe(
      demoSuppliers.length,
    );
    expect(new Set(demoCustomers.map((customer) => customer.email)).size).toBe(
      demoCustomers.length,
    );
  });

  it("validates all fictional records with the existing API schemas", () => {
    const categoryIds = new Map(
      demoCategories.map((category, index) => [
        category.key,
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      ]),
    );

    for (const branch of demoBranches) {
      expect(() =>
        createBranchSchema.parse({
          name: branch.name,
          address: branch.address,
          phone: null,
        }),
      ).not.toThrow();
    }
    for (const category of demoCategories) {
      expect(() =>
        createCategorySchema.parse({
          name: category.name,
          description: category.description,
        }),
      ).not.toThrow();
    }
    for (const supplier of demoSuppliers) {
      expect(() =>
        createSupplierSchema.parse({
          name: supplier.name,
          email: supplier.email,
          address: supplier.address,
        }),
      ).not.toThrow();
      expect(supplier.email.endsWith(".example")).toBe(true);
    }
    for (const customer of demoCustomers) {
      expect(() =>
        createCustomerSchema.parse({
          name: customer.name,
          email: customer.email,
          address: customer.address,
        }),
      ).not.toThrow();
      expect(customer.email.endsWith(".example")).toBe(true);
    }
    for (const product of demoProducts) {
      const categoryId = categoryIds.get(product.categoryKey);
      expect(categoryId).toBeDefined();
      expect(() =>
        createProductSchema.parse({
          ...product,
          categoryId,
        }),
      ).not.toThrow();
    }
  });
});
