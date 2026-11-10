import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../features/auth/useAuth";
import { listProducts, type Product } from "../features/catalog/catalogApi";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  createSupplier,
  getPurchaseOrder,
  getSupplier,
  listPurchaseOrders,
  listSuppliers,
  receivePurchaseOrder,
  updatePurchaseOrder,
  updateSupplier,
  type PurchaseOrder,
  type Supplier,
} from "../features/purchasing/purchasingApi";
import { listBranches, type BranchOption } from "../features/stock/stockApi";
import { PurchaseOrdersPage } from "./PurchaseOrdersPage";
import { SuppliersPage } from "./SuppliersPage";

vi.mock("../features/auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../features/catalog/catalogApi", () => ({
  listProducts: vi.fn(),
}));
vi.mock("../features/stock/stockApi", () => ({
  listBranches: vi.fn(),
}));
vi.mock("../features/purchasing/purchasingApi", () => ({
  approvePurchaseOrder: vi.fn(),
  cancelPurchaseOrder: vi.fn(),
  createPurchaseOrder: vi.fn(),
  createSupplier: vi.fn(),
  getPurchaseOrder: vi.fn(),
  getSupplier: vi.fn(),
  listPurchaseOrders: vi.fn(),
  listSuppliers: vi.fn(),
  receivePurchaseOrder: vi.fn(),
  updatePurchaseOrder: vi.fn(),
  updateSupplier: vi.fn(),
}));
vi.mock("../lib/api", () => ({
  getApiErrorMessage: (error: unknown, fallback?: string) =>
    error instanceof Error ? error.message : fallback ?? "Request failed.",
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}));

const supplierId = "e501fe6c-78bb-432a-b3b2-cfab4d08e8f3";
const branchId = "d74a189c-ef06-4797-a394-357d764680c3";
const productId = "72a1199f-6f5c-4140-a050-49a23e74e4a0";
const purchaseOrderId = "c50b8962-58db-4efb-883f-4bb04af77873";
const purchaseOrderItemId = "f359540d-f9ea-4aeb-ae07-b919a6261a0b";
const pagination = { page: 1, limit: 10, total: 1, totalPages: 1 };

const supplier: Supplier = {
  id: supplierId,
  name: "Acme Supplies",
  contactName: "Morgan Lee",
  email: "morgan@acme.example",
  phone: "+1 555 0100",
  address: "100 Market Street",
  taxNumber: "TAX-001",
  isActive: true,
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const branch: BranchOption = {
  id: branchId,
  name: "Central",
  isActive: true,
};

const product: Product = {
  id: productId,
  sku: "ELE-001",
  barcode: null,
  name: "Wireless Mouse",
  description: null,
  unit: "unit",
  categoryId: supplierId,
  costPrice: "4.00",
  sellingPrice: "8.00",
  reorderLevel: 3,
  isActive: true,
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const order: PurchaseOrder = {
  id: purchaseOrderId,
  number: "PO-2026-0001",
  supplierId,
  branchId,
  createdById: "a1fb5cb2-b3b7-4881-89ea-33a8d7b341f1",
  approvedById: null,
  status: "DRAFT",
  orderedAt: "2026-01-10T00:00:00.000Z",
  expectedAt: "2026-01-20T00:00:00.000Z",
  approvedAt: null,
  notes: null,
  subtotal: "12.50",
  tax: "1.25",
  total: "13.75",
  createdAt: "2026-01-10T00:00:00.000Z",
  updatedAt: "2026-01-10T00:00:00.000Z",
  supplier: {
    id: supplierId,
    name: supplier.name,
    email: supplier.email,
  },
  branch: { id: branchId, name: branch.name },
  items: [
    {
      id: purchaseOrderItemId,
      productId,
      quantity: 5,
      receivedQuantity: 0,
      unitCost: "2.50",
      lineTotal: "12.50",
      product: {
        id: productId,
        sku: product.sku,
        name: product.name,
        unit: product.unit,
      },
    },
  ],
};

function setRole(
  role: "ADMIN" | "MANAGER" | "STOREKEEPER" | "SALES" | "ACCOUNTANT",
) {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "a1fb5cb2-b3b7-4881-89ea-33a8d7b341f1",
      name: "Alex Morgan",
      email: "alex@example.com",
      role,
      branchId: role === "ADMIN" || role === "MANAGER" ? null : branchId,
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

function mockPurchasingData() {
  vi.mocked(listSuppliers).mockResolvedValue({
    suppliers: [supplier],
    pagination,
  });
  vi.mocked(listPurchaseOrders).mockResolvedValue({
    purchaseOrders: [order],
    pagination,
  });
  vi.mocked(listBranches).mockResolvedValue({
    branches: [branch],
    pagination,
  });
  vi.mocked(listProducts).mockResolvedValue({
    products: [product],
    pagination,
  });
  vi.mocked(getSupplier).mockResolvedValue(supplier);
  vi.mocked(getPurchaseOrder).mockResolvedValue(order);
  vi.mocked(createSupplier).mockResolvedValue(supplier);
  vi.mocked(updateSupplier).mockResolvedValue(supplier);
  vi.mocked(createPurchaseOrder).mockResolvedValue(order);
  vi.mocked(updatePurchaseOrder).mockResolvedValue(order);
  vi.mocked(approvePurchaseOrder).mockResolvedValue({
    ...order,
    status: "APPROVED",
  });
  vi.mocked(cancelPurchaseOrder).mockResolvedValue({
    ...order,
    status: "CANCELLED",
  });
  vi.mocked(receivePurchaseOrder).mockResolvedValue({
    goodsReceipt: {
      id: purchaseOrderItemId,
      number: "GRN-2026-0001",
      purchaseOrderId,
      branchId,
      receivedById: "a1fb5cb2-b3b7-4881-89ea-33a8d7b341f1",
      receivedAt: "2026-01-11T00:00:00.000Z",
      notes: null,
      createdAt: "2026-01-11T00:00:00.000Z",
      items: [{ id: purchaseOrderItemId, purchaseOrderItemId, quantity: 2, unitCost: "2.50" }],
    },
    purchaseOrder: { ...order, status: "PARTIALLY_RECEIVED" },
  });
}

beforeEach(() => {
  vi.mocked(useAuth).mockReset();
  vi.mocked(listProducts).mockReset();
  vi.mocked(listBranches).mockReset();
  vi.mocked(approvePurchaseOrder).mockReset();
  vi.mocked(cancelPurchaseOrder).mockReset();
  vi.mocked(createPurchaseOrder).mockReset();
  vi.mocked(createSupplier).mockReset();
  vi.mocked(getPurchaseOrder).mockReset();
  vi.mocked(getSupplier).mockReset();
  vi.mocked(listPurchaseOrders).mockReset();
  vi.mocked(listSuppliers).mockReset();
  vi.mocked(receivePurchaseOrder).mockReset();
  vi.mocked(updatePurchaseOrder).mockReset();
  vi.mocked(updateSupplier).mockReset();
  setRole("ADMIN");
  mockPurchasingData();
});

describe("supplier management", () => {
  it("searches and sorts suppliers and loads supplier details", async () => {
    const user = userEvent.setup();
    renderPage(<SuppliersPage />);

    expect(await screen.findByText("Acme Supplies")).toBeVisible();
    await user.type(screen.getByLabelText("Search suppliers"), "Acme");
    await user.selectOptions(screen.getByLabelText("Sort by"), "createdAt");
    await user.selectOptions(screen.getByLabelText("Direction"), "desc");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(listSuppliers).toHaveBeenLastCalledWith({
        page: 1,
        limit: 10,
        isActive: true,
        sortBy: "createdAt",
        sortOrder: "desc",
        search: "Acme",
      });
    });

    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(await screen.findByText("100 Market Street")).toBeVisible();
    expect(getSupplier).toHaveBeenCalledWith(supplierId);
  });

  it("validates and creates a supplier with normalized optional fields", async () => {
    const user = userEvent.setup();
    renderPage(<SuppliersPage />);
    await user.click(await screen.findByRole("button", { name: "Add supplier" }));
    const dialog = within(screen.getByRole("dialog"));

    await user.click(dialog.getByRole("button", { name: "Create supplier" }));
    expect(await screen.findByText("Supplier name is required")).toBeVisible();
    expect(createSupplier).not.toHaveBeenCalled();

    await user.type(dialog.getByLabelText("Supplier name"), "New Supplier");
    await user.type(dialog.getByLabelText("Email"), "OPS@EXAMPLE.COM");
    await user.click(dialog.getByRole("button", { name: "Create supplier" }));

    await waitFor(() => {
      expect(createSupplier).toHaveBeenCalledWith({
        name: "New Supplier",
        contactName: null,
        email: "ops@example.com",
        phone: null,
        address: null,
        taxNumber: null,
      });
    });
  });

  it("edits supplier details and changes the active state through PATCH", async () => {
    const user = userEvent.setup();
    renderPage(<SuppliersPage />);
    expect(await screen.findByText("Acme Supplies")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.clear(dialog.getByLabelText("Supplier name"));
    await user.type(dialog.getByLabelText("Supplier name"), "Acme Wholesale");
    await user.click(dialog.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateSupplier).toHaveBeenCalledWith(supplierId, {
        name: "Acme Wholesale",
        contactName: "Morgan Lee",
        email: "morgan@acme.example",
        phone: "+1 555 0100",
        address: "100 Market Street",
        taxNumber: "TAX-001",
      });
    });

    await user.click(await screen.findByRole("button", { name: "Deactivate" }));
    await waitFor(() => {
      expect(updateSupplier).toHaveBeenLastCalledWith(supplierId, {
        isActive: false,
      });
    });
  });

  it("keeps supplier mutations hidden for read-only roles", async () => {
    setRole("STOREKEEPER");
    renderPage(<SuppliersPage />);

    expect(await screen.findByText("Acme Supplies")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add supplier" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deactivate" })).toBeNull();
  });
});

describe("purchase-order management", () => {
  it("filters the order list and displays server-calculated totals in details", async () => {
    const user = userEvent.setup();
    renderPage(<PurchaseOrdersPage />);

    expect(await screen.findByText("PO-2026-0001")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Status"), "DRAFT");
    await user.selectOptions(screen.getByLabelText("Branch"), branchId);
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(listPurchaseOrders).toHaveBeenLastCalledWith({
        page: 1,
        limit: 10,
        sortBy: "orderedAt",
        sortOrder: "desc",
        status: "DRAFT",
        branchId,
      });
    });

    await user.click(screen.getByRole("button", { name: "Details" }));
    expect(
      await within(await screen.findByRole("dialog")).findByText("13.75"),
    ).toBeVisible();
    expect(getPurchaseOrder).toHaveBeenCalledWith(purchaseOrderId);
  });

  it("creates a draft order with selected supplier, branch and multiple item fields", async () => {
    const user = userEvent.setup();
    renderPage(<PurchaseOrdersPage />);
    await user.click(
      await screen.findByRole("button", { name: "Create purchase order" }),
    );
    const dialog = within(screen.getByRole("dialog"));

    await user.selectOptions(dialog.getByLabelText("Supplier"), supplierId);
    await user.selectOptions(dialog.getByLabelText("Branch"), branchId);
    fireEvent.change(dialog.getByLabelText("Expected delivery"), {
      target: { value: "2026-07-14" },
    });
    await user.clear(dialog.getByLabelText("Tax amount"));
    await user.type(dialog.getByLabelText("Tax amount"), "1.50");
    await user.selectOptions(dialog.getByLabelText("Product"), productId);
    await user.clear(dialog.getByLabelText("Quantity"));
    await user.type(dialog.getByLabelText("Quantity"), "3");
    await user.clear(dialog.getByLabelText("Unit cost"));
    await user.type(dialog.getByLabelText("Unit cost"), "4.25");
    await user.click(dialog.getByRole("button", { name: "Create draft" }));

    await waitFor(() => {
      expect(createPurchaseOrder).toHaveBeenCalledWith({
        supplierId,
        branchId,
        expectedAt: "2026-07-14T00:00:00.000Z",
        notes: null,
        tax: "1.50",
        items: [{ productId, quantity: 3, unitCost: "4.25" }],
      });
    });
  });

  it("edits draft details without resending unchanged item lines", async () => {
    const user = userEvent.setup();
    renderPage(<PurchaseOrdersPage />);
    expect(await screen.findByText("PO-2026-0001")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.type(dialog.getByLabelText("Notes"), "Deliver before month end");
    await user.click(dialog.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(updatePurchaseOrder).toHaveBeenCalledWith(purchaseOrderId, {
        expectedAt: "2026-01-20T00:00:00.000Z",
        notes: "Deliver before month end",
        tax: "1.25",
      });
    });
  });

  it("allows managers to approve and cancel orders", async () => {
    setRole("MANAGER");
    const user = userEvent.setup();
    renderPage(<PurchaseOrdersPage />);
    expect(await screen.findByText("PO-2026-0001")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(approvePurchaseOrder).toHaveBeenCalledWith(purchaseOrderId));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Cancel order" }));
    await waitFor(() => expect(cancelPurchaseOrder).toHaveBeenCalledWith(purchaseOrderId));
  });

  it("records a partial receipt for a storekeeper and hides approval", async () => {
    setRole("STOREKEEPER");
    vi.mocked(listPurchaseOrders).mockResolvedValue({
      purchaseOrders: [{ ...order, status: "APPROVED" }],
      pagination,
    });
    vi.mocked(getPurchaseOrder).mockResolvedValue({
      ...order,
      status: "APPROVED",
    });
    const user = userEvent.setup();
    renderPage(<PurchaseOrdersPage />);
    expect(await screen.findByText("PO-2026-0001")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Receive" }));
    const dialog = within(await screen.findByRole("dialog"));
    const quantity = dialog.getByLabelText("Receive quantity");
    await user.clear(quantity);
    await user.type(quantity, "2");
    await user.type(dialog.getByLabelText("Receipt notes"), "Partial delivery");
    await user.click(dialog.getByRole("button", { name: "Record receipt" }));

    await waitFor(() => {
      expect(receivePurchaseOrder).toHaveBeenCalledWith(purchaseOrderId, {
        items: [{ purchaseOrderItemId, quantity: 2 }],
        notes: "Partial delivery",
      });
    });
  });
});
