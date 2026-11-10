import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../features/auth/useAuth";
import {
  listCategories,
  listProducts,
  type Category,
  type Product,
} from "../features/catalog/catalogApi";
import {
  adjustStock,
  listBranches,
  listStock,
  transferStock,
  type BranchOption,
  type StockListResponse,
  type StockRecord,
  type TransferResult,
} from "../features/stock/stockApi";
import { StockPage } from "./StockPage";

vi.mock("../features/auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../features/catalog/catalogApi", () => ({
  listCategories: vi.fn(),
  listProducts: vi.fn(),
}));
vi.mock("../features/stock/stockApi", () => ({
  adjustStock: vi.fn(),
  listBranches: vi.fn(),
  listStock: vi.fn(),
  transferStock: vi.fn(),
}));
vi.mock("../lib/api", () => ({
  getApiErrorMessage: (error: unknown, fallback?: string) =>
    error instanceof Error ? error.message : fallback ?? "Request failed.",
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}));

const branchId = "e501fe6c-78bb-432a-b3b2-cfab4d08e8f3";
const destinationBranchId = "d74a189c-ef06-4797-a394-357d764680c3";
const categoryId = "72a1199f-6f5c-4140-a050-49a23e74e4a0";
const productId = "c50b8962-58db-4efb-883f-4bb04af77873";
const pagination = { page: 1, limit: 10, total: 1, totalPages: 1 };

const branches: BranchOption[] = [
  { id: branchId, name: "Colombo", isActive: true },
  { id: destinationBranchId, name: "Kandy", isActive: true },
];

const category: Category = {
  id: categoryId,
  name: "Electronics",
  description: null,
  isActive: true,
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const product: Product = {
  id: productId,
  sku: "ELE-001",
  barcode: "123456789",
  name: "USB-C Charger",
  description: null,
  unit: "unit",
  categoryId,
  costPrice: "12.50",
  sellingPrice: "20.00",
  reorderLevel: 4,
  isActive: true,
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const stockRecord: StockRecord = {
  id: "stock-row-id",
  productId,
  branchId,
  quantity: 2,
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  product: {
    id: productId,
    sku: product.sku,
    barcode: product.barcode,
    name: product.name,
    unit: product.unit,
    categoryId,
    reorderLevel: product.reorderLevel,
    category: { id: categoryId, name: category.name },
  },
  branch: { id: branchId, name: "Colombo" },
};

const stockResult: StockListResponse = {
  stock: [stockRecord],
  pagination,
};

function setRole(
  role: "ADMIN" | "MANAGER" | "STOREKEEPER" | "SALES" | "ACCOUNTANT",
) {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "d4f79285-4be7-4c54-95a7-143268b8474c",
      name: "Alex Morgan",
      email: "alex@example.com",
      role,
      branchId:
        role === "ADMIN" || role === "MANAGER" ? null : branchId,
      isActive: true,
    },
    status: "authenticated",
    login: vi.fn(async () => {}),
    logout: vi.fn(),
  });
}

function mockData(role: "ADMIN" | "MANAGER" | "STOREKEEPER" | "SALES" | "ACCOUNTANT") {
  vi.mocked(listStock).mockResolvedValue(stockResult);
  vi.mocked(listBranches).mockResolvedValue({
    branches:
      role === "ADMIN" || role === "MANAGER"
        ? branches
        : [branches[0]],
    pagination: { ...pagination, total: role === "ADMIN" || role === "MANAGER" ? 2 : 1 },
  });
  vi.mocked(listCategories).mockImplementation(async (params) => ({
    categories: params.isActive ? [category] : [],
    pagination: params.isActive
      ? pagination
      : { ...pagination, total: 0, totalPages: 0 },
  }));
  vi.mocked(listProducts).mockResolvedValue({
    products: [product],
    pagination,
  });
  vi.mocked(adjustStock).mockResolvedValue(stockRecord);
  vi.mocked(transferStock).mockResolvedValue({
    transferId: "transfer-123",
    fromBranchId: branchId,
    toBranchId: destinationBranchId,
    items: [{ productId, sourceQuantity: 3, destinationQuantity: 2 }],
  } satisfies TransferResult);
}

beforeEach(() => {
  vi.mocked(useAuth).mockReset();
  vi.mocked(listStock).mockReset();
  vi.mocked(listBranches).mockReset();
  vi.mocked(listCategories).mockReset();
  vi.mocked(listProducts).mockReset();
  vi.mocked(adjustStock).mockReset();
  vi.mocked(transferStock).mockReset();
  setRole("ADMIN");
  mockData("ADMIN");
});

describe("stock management", () => {
  it("searches stock by product fields and applies branch, category, and status filters", async () => {
    const user = userEvent.setup();
    render(<StockPage />);

    expect(await screen.findByText("USB-C Charger")).toBeVisible();
    await user.type(
      screen.getByLabelText("Search name, SKU or barcode"),
      "123456",
    );
    await user.selectOptions(screen.getByLabelText("Branch"), branchId);
    await user.selectOptions(screen.getByLabelText("Category"), categoryId);
    await user.selectOptions(
      screen.getByLabelText("Stock status"),
      "LOW_STOCK",
    );
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(listStock).toHaveBeenLastCalledWith({
        page: 1,
        limit: 10,
        sortBy: "createdAt",
        sortOrder: "desc",
        search: "123456",
        branchId,
        categoryId,
        status: "LOW_STOCK",
      });
    });
  });

  it("requires a reason and sends decreases as negative adjustments for the user's branch", async () => {
    setRole("STOREKEEPER");
    mockData("STOREKEEPER");
    const user = userEvent.setup();
    render(<StockPage />);

    await user.click(
      await screen.findByRole("button", { name: "Adjust stock" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    await user.selectOptions(dialog.getByLabelText("Product"), productId);
    await user.selectOptions(
      dialog.getByLabelText("Adjustment"),
      "DECREASE",
    );
    await user.clear(dialog.getByLabelText("Quantity"));
    await user.type(dialog.getByLabelText("Quantity"), "2");
    await user.click(dialog.getByRole("button", { name: "Apply adjustment" }));

    expect(await screen.findByText("A reason is required")).toBeVisible();
    expect(adjustStock).not.toHaveBeenCalled();

    await user.type(dialog.getByLabelText("Reason"), "Damaged during handling");
    await user.click(dialog.getByRole("button", { name: "Apply adjustment" }));

    await waitFor(() => {
      expect(adjustStock).toHaveBeenCalledWith({
        branchId,
        productId,
        quantity: -2,
        notes: "Damaged during handling",
      });
    });
  });

  it("completes a manager transfer and shows the returned transfer as completed", async () => {
    const user = userEvent.setup();
    render(<StockPage />);

    await user.click(
      await screen.findByRole("button", { name: "Transfer stock" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    await user.selectOptions(
      dialog.getByLabelText("Source branch"),
      branchId,
    );
    await user.selectOptions(
      dialog.getByLabelText("Destination branch"),
      destinationBranchId,
    );
    await user.selectOptions(dialog.getByLabelText("Product"), productId);
    await user.clear(dialog.getByLabelText("Quantity"));
    await user.type(dialog.getByLabelText("Quantity"), "3");
    await user.click(dialog.getByRole("button", { name: "Complete transfer" }));

    await waitFor(() => {
      expect(transferStock).toHaveBeenCalledWith({
        fromBranchId: branchId,
        toBranchId: destinationBranchId,
        notes: undefined,
        items: [{ productId, quantity: 3 }],
      });
    });
    const transferTable = screen.getAllByRole("table")[1];
    expect(
      within(transferTable).getByText("Completed", { selector: "span" }),
    ).toBeVisible();
    expect(within(transferTable).getByText(/Kandy/)).toBeVisible();
    expect(within(transferTable).getByText("transfer-123")).toBeVisible();
  });

  it("locks a storekeeper's source branch and requires a destination branch ID", async () => {
    setRole("STOREKEEPER");
    mockData("STOREKEEPER");
    const user = userEvent.setup();
    render(<StockPage />);

    await user.click(
      await screen.findByRole("button", { name: "Transfer stock" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Colombo")).toBeVisible();
    expect(dialog.queryByLabelText("Source branch")).not.toBeInTheDocument();

    await user.type(
      dialog.getByLabelText("Destination branch ID"),
      destinationBranchId,
    );
    await user.selectOptions(dialog.getByLabelText("Product"), productId);
    await user.click(dialog.getByRole("button", { name: "Complete transfer" }));

    await waitFor(() => {
      expect(transferStock).toHaveBeenCalledWith({
        fromBranchId: branchId,
        toBranchId: destinationBranchId,
        notes: undefined,
        items: [{ productId, quantity: 1 }],
      });
    });
  });

  it("keeps adjustment and transfer actions hidden for sales users", async () => {
    setRole("SALES");
    mockData("SALES");
    render(<StockPage />);

    expect(await screen.findByText("USB-C Charger")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Adjust stock" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Transfer stock" }),
    ).not.toBeInTheDocument();
  });

  it("shows loading, empty, and recoverable error states", async () => {
    let resolveStock: ((value: StockListResponse) => void) | undefined;
    vi.mocked(listStock).mockReturnValue(
      new Promise((resolve) => {
        resolveStock = resolve;
      }),
    );
    render(<StockPage />);
    expect(screen.getByText("Loading stock")).toBeVisible();

    resolveStock?.({ stock: [], pagination: { ...pagination, total: 0, totalPages: 0 } });
    expect(
      await screen.findByText("No stock records match these filters."),
    ).toBeVisible();

    vi.mocked(listStock).mockRejectedValueOnce(new Error("Stock service is unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(await screen.findByText("Stock service is unavailable")).toBeVisible();

    vi.mocked(listStock).mockResolvedValue(stockResult);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("USB-C Charger")).toBeVisible();
  });
});
