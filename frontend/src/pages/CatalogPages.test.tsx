import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../features/auth/useAuth";
import {
  createCategory,
  createProduct,
  listCategories,
  listProducts,
  updateCategory,
  updateProduct,
  type Category,
  type Product,
} from "../features/catalog/catalogApi";
import { CategoriesPage } from "./CategoriesPage";
import { ProductsPage } from "./ProductsPage";

vi.mock("../features/auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../features/catalog/catalogApi", () => ({
  createCategory: vi.fn(),
  createProduct: vi.fn(),
  listCategories: vi.fn(),
  listProducts: vi.fn(),
  updateCategory: vi.fn(),
  updateProduct: vi.fn(),
}));
vi.mock("../lib/api", () => ({
  getApiErrorMessage: (error: unknown, fallback?: string) =>
    error instanceof Error ? error.message : fallback ?? "Request failed.",
}));

const categoryId = "e501fe6c-78bb-432a-b3b2-cfab4d08e8f3";
const productId = "5c2fbf88-6d51-49d4-8e0c-7a8a976fd2c4";
const page = {
  page: 1,
  limit: 10,
  total: 1,
  totalPages: 1,
};

const category: Category = {
  id: categoryId,
  name: "Accessories",
  description: "Computer accessories",
  isActive: true,
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const product: Product = {
  id: productId,
  sku: "ACC-001",
  barcode: "123456789",
  name: "USB-C Charger",
  description: "Fast charger",
  unit: "unit",
  categoryId,
  costPrice: "12.50",
  sellingPrice: "20.00",
  reorderLevel: 5,
  isActive: true,
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

function setRole(role: "ADMIN" | "MANAGER" | "STOREKEEPER" | "SALES" | "ACCOUNTANT") {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "c345d7dc-cb44-4331-b65d-4c56a15aac2b",
      name: "Alex Morgan",
      email: "alex@example.com",
      role,
      branchId: role === "ADMIN" ? null : categoryId,
      isActive: true,
    },
    status: "authenticated",
    login: vi.fn(async () => {}),
    logout: vi.fn(),
  });
}

function renderPage(element: ReactNode) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

beforeEach(() => {
  vi.mocked(useAuth).mockReset();
  vi.mocked(listProducts).mockReset();
  vi.mocked(listCategories).mockReset();
  vi.mocked(createProduct).mockReset();
  vi.mocked(updateProduct).mockReset();
  vi.mocked(createCategory).mockReset();
  vi.mocked(updateCategory).mockReset();

  setRole("ADMIN");
  vi.mocked(listProducts).mockResolvedValue({
    products: [product],
    pagination: page,
  });
  vi.mocked(listCategories).mockImplementation(async (params) => ({
    categories: params.isActive ? [category] : [],
    pagination: params.isActive
      ? page
      : { ...page, total: 0, totalPages: 0 },
  }));
  vi.mocked(createProduct).mockResolvedValue(product);
  vi.mocked(updateProduct).mockResolvedValue(product);
  vi.mocked(createCategory).mockResolvedValue(category);
  vi.mocked(updateCategory).mockResolvedValue(category);
});

describe("products page", () => {
  it("searches by name, SKU, barcode, and category and opens product details", async () => {
    const user = userEvent.setup();
    renderPage(<ProductsPage />);

    expect(await screen.findByText("USB-C Charger")).toBeVisible();
    await user.type(screen.getByLabelText("Product name"), "charger");
    await user.type(screen.getByLabelText("SKU"), "ACC");
    await user.type(screen.getByLabelText("Barcode"), "123");
    await user.selectOptions(
      screen.getByLabelText("Category"),
      categoryId,
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(listProducts).toHaveBeenLastCalledWith({
        page: 1,
        limit: 10,
        isActive: true,
        name: "charger",
        sku: "ACC",
        barcode: "123",
        categoryId,
      });
    });

    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("123456789");
    expect(screen.getByRole("dialog")).toHaveTextContent("Fast charger");
  });

  it("validates and creates a product using the active category", async () => {
    const user = userEvent.setup();
    renderPage(<ProductsPage />);

    await user.click(
      await screen.findByRole("button", { name: "Add product" }),
    );
    await user.click(screen.getByRole("button", { name: "Create product" }));
    expect(await screen.findByText("Product name is required")).toBeVisible();
    expect(createProduct).not.toHaveBeenCalled();

    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText("Product name"), "USB-C Charger");
    await user.type(dialog.getByLabelText("SKU"), "ACC-001");
    await user.type(dialog.getByLabelText("Barcode"), "123456789");
    await user.selectOptions(dialog.getByLabelText("Category"), categoryId);
    await user.type(dialog.getByLabelText("Cost price"), "12.50");
    await user.type(dialog.getByLabelText("Selling price"), "20.00");
    await user.clear(dialog.getByLabelText("Reorder level"));
    await user.type(dialog.getByLabelText("Reorder level"), "5");
    await user.click(dialog.getByRole("button", { name: "Create product" }));

    await waitFor(() => {
      expect(createProduct).toHaveBeenCalledWith({
        sku: "ACC-001",
        barcode: "123456789",
        name: "USB-C Charger",
        description: null,
        unit: "unit",
        categoryId,
        costPrice: "12.50",
        sellingPrice: "20.00",
        reorderLevel: 5,
      });
    });
  });

  it("edits and deactivates products through the supported PATCH endpoint", async () => {
    const user = userEvent.setup();
    renderPage(<ProductsPage />);

    expect(await screen.findByText("USB-C Charger")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.clear(dialog.getByLabelText("Product name"));
    await user.type(dialog.getByLabelText("Product name"), "Revised charger");
    await user.click(dialog.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateProduct).toHaveBeenCalledWith(productId, {
        sku: "ACC-001",
        barcode: "123456789",
        name: "Revised charger",
        description: "Fast charger",
        unit: "unit",
        costPrice: "12.50",
        sellingPrice: "20.00",
        reorderLevel: 5,
      });
    });

    await user.click(
      await screen.findByRole("button", { name: "Deactivate" }),
    );
    await waitFor(() => {
      expect(updateProduct).toHaveBeenLastCalledWith(productId, {
        isActive: false,
      });
    });
  });

  it("moves through product result pages", async () => {
    vi.mocked(listProducts).mockResolvedValue({
      products: [product],
      pagination: { ...page, total: 25, totalPages: 3 },
    });
    const user = userEvent.setup();
    renderPage(<ProductsPage />);

    expect(await screen.findByText("USB-C Charger")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(listProducts).toHaveBeenLastCalledWith({
        page: 2,
        limit: 10,
        isActive: true,
      });
    });
  });

  it("keeps product mutations hidden for read-only roles", async () => {
    setRole("SALES");
    renderPage(<ProductsPage />);

    expect(await screen.findByText("USB-C Charger")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Add product" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Deactivate" }),
    ).not.toBeInTheDocument();
  });
});

describe("categories page", () => {
  it("creates a category and validates its required name", async () => {
    const user = userEvent.setup();
    renderPage(<CategoriesPage />);

    expect(await screen.findByText("Accessories")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Add category" }));
    await user.click(screen.getByRole("button", { name: "Create category" }));

    expect(await screen.findByText("Category name is required")).toBeVisible();
    expect(createCategory).not.toHaveBeenCalled();

    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText("Category name"), "Peripherals");
    await user.type(
      dialog.getByLabelText("Description"),
      "Keyboards and pointing devices",
    );
    await user.click(dialog.getByRole("button", { name: "Create category" }));

    await waitFor(() => {
      expect(createCategory).toHaveBeenCalledWith({
        name: "Peripherals",
        description: "Keyboards and pointing devices",
      });
    });
  });

  it("edits and deactivates categories through the supported PATCH endpoint", async () => {
    const user = userEvent.setup();
    renderPage(<CategoriesPage />);

    expect(await screen.findByText("Accessories")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.clear(dialog.getByLabelText("Category name"));
    await user.type(dialog.getByLabelText("Category name"), "Peripherals");
    await user.click(dialog.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateCategory).toHaveBeenCalledWith(categoryId, {
        name: "Peripherals",
        description: "Computer accessories",
      });
    });

    await user.click(
      await screen.findByRole("button", { name: "Deactivate" }),
    );
    await waitFor(() => {
      expect(updateCategory).toHaveBeenLastCalledWith(categoryId, {
        isActive: false,
      });
    });
  });

  it("restricts category creation and editing to managers and admins", async () => {
    setRole("ACCOUNTANT");
    renderPage(<CategoriesPage />);

    expect(await screen.findByText("Accessories")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Add category" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
  });
});
