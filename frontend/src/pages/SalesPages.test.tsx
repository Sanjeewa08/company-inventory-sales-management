import {
  fireEvent,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../features/auth/useAuth";
import { listProducts, type Product } from "../features/catalog/catalogApi";
import {
  acceptQuotation,
  cancelInvoice,
  createCustomer,
  createInvoice,
  createInvoicePayment,
  createQuotation,
  expireQuotation,
  getCustomer,
  getInvoice,
  getQuotation,
  listCustomers,
  listInvoicePayments,
  listInvoices,
  listQuotations,
  sendQuotation,
  updateCustomer,
  updateQuotation,
  type Customer,
  type Invoice,
  type Payment,
  type Quotation,
} from "../features/sales/salesApi";
import { listBranches, type BranchOption } from "../features/stock/stockApi";
import { CustomersPage } from "./CustomersPage";
import { InvoicesPage } from "./InvoicesPage";
import { QuotationsPage } from "./QuotationsPage";

vi.mock("../features/auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../features/catalog/catalogApi", () => ({
  listProducts: vi.fn(),
}));
vi.mock("../features/stock/stockApi", () => ({
  listBranches: vi.fn(),
}));
vi.mock("../features/sales/salesApi", () => ({
  acceptQuotation: vi.fn(),
  cancelInvoice: vi.fn(),
  createCustomer: vi.fn(),
  createInvoice: vi.fn(),
  createInvoicePayment: vi.fn(),
  createQuotation: vi.fn(),
  expireQuotation: vi.fn(),
  getCustomer: vi.fn(),
  getInvoice: vi.fn(),
  getQuotation: vi.fn(),
  listCustomers: vi.fn(),
  listInvoicePayments: vi.fn(),
  listInvoices: vi.fn(),
  listQuotations: vi.fn(),
  sendQuotation: vi.fn(),
  updateCustomer: vi.fn(),
  updateQuotation: vi.fn(),
}));
vi.mock("../lib/api", () => ({
  getApiErrorMessage: (error: unknown, fallback?: string) =>
    error instanceof Error ? error.message : fallback ?? "Request failed.",
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const customerId = "e501fe6c-78bb-432a-b3b2-cfab4d08e8f3";
const branchId = "d74a189c-ef06-4797-a394-357d764680c3";
const productId = "72a1199f-6f5c-4140-a050-49a23e74e4a0";
const quotationId = "c50b8962-58db-4efb-883f-4bb04af77873";
const invoiceId = "f359540d-f9ea-4aeb-ae07-b919a6261a0b";
const itemId = "197b1597-ef44-40dd-a4e8-a4c4a06f84e8";
const pagination = { page: 1, limit: 10, total: 1, totalPages: 1 };

const customer: Customer = {
  id: customerId,
  name: "Serendib Imports",
  email: "buyer@example.com",
  phone: "+94112223344",
  address: "Colombo",
  taxNumber: "TAX-123",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const branch: BranchOption = {
  id: branchId,
  name: "Colombo",
  isActive: true,
};

const product: Product = {
  id: productId,
  sku: "ELE-001",
  barcode: null,
  name: "USB-C Charger",
  description: null,
  unit: "unit",
  categoryId: customerId,
  costPrice: "5.00",
  sellingPrice: "12.50",
  reorderLevel: 3,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const quotation: Quotation = {
  id: quotationId,
  number: "QT-2026-0001",
  customerId,
  branchId,
  createdById: "a1fb5cb2-b3b7-4881-89ea-33a8d7b341f1",
  status: "DRAFT",
  issuedAt: "2026-01-02T00:00:00.000Z",
  validUntil: "2026-12-31T00:00:00.000Z",
  notes: "Delivery within one week",
  subtotal: "25.00",
  tax: "2.00",
  total: "27.00",
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  customer: {
    id: customerId,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
  },
  branch: { id: branchId, name: branch.name },
  items: [
    {
      id: itemId,
      productId,
      quantity: 2,
      unitPrice: "12.50",
      lineTotal: "25.00",
      product: {
        id: productId,
        sku: product.sku,
        name: product.name,
        unit: product.unit,
      },
    },
  ],
};

const invoice: Invoice = {
  id: invoiceId,
  number: "INV-2026-0001",
  customerId,
  branchId,
  quotationId: null,
  createdById: "a1fb5cb2-b3b7-4881-89ea-33a8d7b341f1",
  status: "PENDING",
  issuedAt: "2026-02-01T00:00:00.000Z",
  dueAt: "2026-02-14T00:00:00.000Z",
  notes: "Customer requested delivery",
  subtotal: "25.00",
  discount: "3.00",
  tax: "2.00",
  total: "24.00",
  createdAt: "2026-02-01T00:00:00.000Z",
  updatedAt: "2026-02-01T00:00:00.000Z",
  customer: {
    id: customerId,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
  },
  branch: { id: branchId, name: branch.name },
  items: [
    {
      id: itemId,
      productId,
      quantity: 2,
      unitPrice: "12.50",
      lineTotal: "25.00",
      product: {
        id: productId,
        sku: product.sku,
        name: product.name,
        unit: product.unit,
      },
    },
  ],
};

const payment: Payment = {
  id: itemId,
  invoiceId,
  receivedById: "a1fb5cb2-b3b7-4881-89ea-33a8d7b341f1",
  amount: "10.00",
  method: "CASH",
  reference: "PAY-001",
  receivedAt: "2026-02-02T00:00:00.000Z",
  notes: null,
  createdAt: "2026-02-02T00:00:00.000Z",
};

function setRole(
  role: "ADMIN" | "MANAGER" | "SALES" | "ACCOUNTANT" | "STOREKEEPER",
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

function mockData() {
  vi.mocked(listCustomers).mockResolvedValue({
    customers: [customer],
    pagination,
  });
  vi.mocked(listQuotations).mockResolvedValue({
    quotations: [quotation],
    pagination,
  });
  vi.mocked(listInvoices).mockResolvedValue({
    invoices: [invoice],
    pagination,
  });
  vi.mocked(listInvoicePayments).mockResolvedValue([]);
  vi.mocked(listBranches).mockResolvedValue({
    branches: [branch],
    pagination,
  });
  vi.mocked(listProducts).mockResolvedValue({
    products: [product],
    pagination,
  });
  vi.mocked(getCustomer).mockResolvedValue(customer);
  vi.mocked(getQuotation).mockResolvedValue(quotation);
  vi.mocked(getInvoice).mockResolvedValue(invoice);
  vi.mocked(createCustomer).mockResolvedValue(customer);
  vi.mocked(updateCustomer).mockResolvedValue(customer);
  vi.mocked(createQuotation).mockResolvedValue(quotation);
  vi.mocked(updateQuotation).mockResolvedValue(quotation);
  vi.mocked(sendQuotation).mockResolvedValue({ ...quotation, status: "SENT" });
  vi.mocked(acceptQuotation).mockResolvedValue({ ...quotation, status: "ACCEPTED" });
  vi.mocked(expireQuotation).mockResolvedValue({ ...quotation, status: "EXPIRED" });
  vi.mocked(createInvoice).mockResolvedValue(invoice);
  vi.mocked(cancelInvoice).mockResolvedValue({ ...invoice, status: "CANCELLED" });
  vi.mocked(createInvoicePayment).mockResolvedValue({
    payment,
    invoice: { ...invoice, status: "PARTIAL" },
    paidAmount: "10",
    balance: "14",
  });
}

beforeEach(() => {
  vi.mocked(useAuth).mockReset();
  vi.mocked(listProducts).mockReset();
  vi.mocked(listBranches).mockReset();
  vi.mocked(acceptQuotation).mockReset();
  vi.mocked(cancelInvoice).mockReset();
  vi.mocked(createCustomer).mockReset();
  vi.mocked(createInvoice).mockReset();
  vi.mocked(createInvoicePayment).mockReset();
  vi.mocked(createQuotation).mockReset();
  vi.mocked(expireQuotation).mockReset();
  vi.mocked(getCustomer).mockReset();
  vi.mocked(getInvoice).mockReset();
  vi.mocked(getQuotation).mockReset();
  vi.mocked(listCustomers).mockReset();
  vi.mocked(listInvoicePayments).mockReset();
  vi.mocked(listInvoices).mockReset();
  vi.mocked(listQuotations).mockReset();
  vi.mocked(sendQuotation).mockReset();
  vi.mocked(updateCustomer).mockReset();
  vi.mocked(updateQuotation).mockReset();
  setRole("ADMIN");
  mockData();
});

afterEach(() => cleanup());

describe("customer management", () => {
  it("searches, opens details, and deactivates a customer", async () => {
    const user = userEvent.setup();
    renderPage(<CustomersPage />);
    expect(await screen.findByText("Serendib Imports")).toBeVisible();
    await user.type(screen.getByLabelText("Search customers"), "Serendib");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(listCustomers).toHaveBeenLastCalledWith({
        page: 1,
        limit: 10,
        isActive: true,
        sortBy: "name",
        sortOrder: "asc",
        search: "Serendib",
      });
    });
    await user.click(screen.getByRole("button", { name: "Details" }));
    const details = within(await screen.findByRole("dialog"));
    expect(await details.findByText("TAX-123")).toBeVisible();
    expect(getCustomer).toHaveBeenCalledWith(customerId);

    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => {
      expect(updateCustomer).toHaveBeenCalledWith(customerId, {
        isActive: false,
      });
    });
  });

  it("validates and creates a customer", async () => {
    const user = userEvent.setup();
    renderPage(<CustomersPage />);
    await user.click(await screen.findByRole("button", { name: "Add customer" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Create customer" }));
    expect(await screen.findByText("Customer name is required")).toBeVisible();
    expect(createCustomer).not.toHaveBeenCalled();

    await user.type(dialog.getByLabelText("Customer name"), "New Buyer");
    await user.type(dialog.getByLabelText("Email"), "BUYER@EXAMPLE.COM");
    await user.click(dialog.getByRole("button", { name: "Create customer" }));
    await waitFor(() => {
      expect(createCustomer).toHaveBeenCalledWith({
        name: "New Buyer",
        email: "buyer@example.com",
        phone: null,
        address: null,
        taxNumber: null,
      });
    });
  });

  it("hides customer mutations from roles outside the customer API", async () => {
    setRole("ACCOUNTANT");
    renderPage(<CustomersPage />);
    expect(await screen.findByText("Access restricted")).toBeVisible();
    expect(listCustomers).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Add customer" })).toBeNull();
  });
});

describe("quotation management", () => {
  it("creates a draft quotation using the selected products and server pricing", async () => {
    const user = userEvent.setup();
    renderPage(<QuotationsPage />);
    await user.click(
      await screen.findByRole("button", { name: "Create quotation" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    await user.selectOptions(dialog.getByLabelText("Customer"), customerId);
    await user.selectOptions(dialog.getByLabelText("Branch"), branchId);
    fireEvent.change(dialog.getByLabelText("Valid until"), {
      target: { value: "2026-12-31" },
    });
    await user.selectOptions(dialog.getByLabelText("Product"), productId);
    await user.clear(dialog.getByLabelText("Quantity"));
    await user.type(dialog.getByLabelText("Quantity"), "2");
    await user.clear(dialog.getByLabelText("Tax amount"));
    await user.type(dialog.getByLabelText("Tax amount"), "2.00");
    await user.click(dialog.getByRole("button", { name: "Create draft" }));

    await waitFor(() => {
      expect(createQuotation).toHaveBeenCalledWith({
        customerId,
        branchId,
        validUntil: "2026-12-31T00:00:00.000Z",
        notes: null,
        tax: "2.00",
        items: [{ productId, quantity: 2, unitPrice: "12.50" }],
      });
    });
  });

  it("sends a draft quotation and accepts a sent quotation", async () => {
    const user = userEvent.setup();
    renderPage(<QuotationsPage />);
    expect(await screen.findByText("QT-2026-0001")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sendQuotation).toHaveBeenCalledWith(quotationId));

    vi.mocked(listQuotations).mockResolvedValue({
      quotations: [{ ...quotation, status: "SENT" }],
      pagination,
    });
    // Load the sent-state view to verify the matching action.
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(await screen.findByRole("button", { name: "Accept" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(acceptQuotation).toHaveBeenCalledWith(quotationId));
  });

  it("routes an accepted quotation to invoice creation", async () => {
    vi.mocked(listQuotations).mockResolvedValue({
      quotations: [{ ...quotation, status: "ACCEPTED" }],
      pagination,
    });
    render(
      <MemoryRouter initialEntries={["/quotations"]}>
        <Routes>
          <Route path="/quotations" element={<QuotationsPage />} />
          <Route
            path="/invoices"
            element={<p>Invoice creation destination</p>}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("button", { name: "Create invoice" }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    expect(await screen.findByText("Invoice creation destination")).toBeVisible();
  });
});

describe("invoice management", () => {
  it("applies supported invoice status, branch and date filters", async () => {
    const user = userEvent.setup();
    renderPage(<InvoicesPage />);
    expect(await screen.findByText("INV-2026-0001")).toBeVisible();
    await user.selectOptions(screen.getByLabelText("Status"), "PENDING");
    await user.selectOptions(screen.getByLabelText("Branch"), branchId);
    fireEvent.change(screen.getByLabelText("Issued from"), {
      target: { value: "2026-02-01" },
    });
    fireEvent.change(screen.getByLabelText("Issued to"), {
      target: { value: "2026-02-28" },
    });
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(listInvoices).toHaveBeenLastCalledWith({
        page: 1,
        limit: 10,
        sortBy: "issuedAt",
        sortOrder: "desc",
        status: "PENDING",
        branchId,
        startDate: "2026-02-01T00:00:00.000Z",
        endDate: "2026-02-28T23:59:59.999Z",
      });
    });
  });

  it("creates an item-based invoice and lets the backend validate stock", async () => {
    const user = userEvent.setup();
    renderPage(<InvoicesPage />);
    await user.click(await screen.findByRole("button", { name: "Create invoice" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.selectOptions(dialog.getByLabelText("Customer"), customerId);
    await user.selectOptions(dialog.getByLabelText("Branch"), branchId);
    await user.selectOptions(dialog.getByLabelText("Product"), productId);
    await user.clear(dialog.getByLabelText("Quantity"));
    await user.type(dialog.getByLabelText("Quantity"), "2");
    await user.clear(dialog.getByLabelText("Discount"));
    await user.type(dialog.getByLabelText("Discount"), "3.00");
    await user.clear(dialog.getByLabelText("Tax"));
    await user.type(dialog.getByLabelText("Tax"), "2.00");
    await user.click(dialog.getByRole("button", { name: "Create invoice" }));

    await waitFor(() => {
      expect(createInvoice).toHaveBeenCalledWith({
        customerId,
        branchId,
        dueAt: null,
        notes: null,
        discount: "3.00",
        tax: "2.00",
        items: [{ productId, quantity: 2, unitPrice: "12.50" }],
      });
    });
  });

  it("creates an invoice directly from an accepted quotation", async () => {
    const user = userEvent.setup();
    renderPage(<InvoicesPage />);
    await user.click(await screen.findByRole("button", { name: "Create invoice" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.selectOptions(dialog.getByLabelText("Invoice source"), "quotation");
    await user.selectOptions(
      dialog.getByLabelText("Accepted quotation"),
      quotationId,
    );
    await user.click(dialog.getByRole("button", { name: "Create invoice" }));

    await waitFor(() => {
      expect(createInvoice).toHaveBeenCalledWith({
        quotationId,
        dueAt: null,
        notes: "Delivery within one week",
      });
    });
  });

  it("records payments for accountants and keeps sales users read-only", async () => {
    setRole("ACCOUNTANT");
    vi.mocked(listInvoicePayments).mockResolvedValue([payment]);
    const user = userEvent.setup();
    renderPage(<InvoicesPage />);
    expect(await screen.findByText("INV-2026-0001")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Details" }));
    const details = within(await screen.findByRole("dialog"));
    expect(await details.findByText("Payment history")).toBeVisible();
    await user.click(details.getByRole("button", { name: "Record payment" }));
    const paymentForm = within(screen.getByRole("dialog"));
    await user.type(paymentForm.getByLabelText("Payment amount"), "5.00");
    await user.selectOptions(
      paymentForm.getByLabelText("Method"),
      "BANK_TRANSFER",
    );
    await user.type(paymentForm.getByLabelText("Reference"), "BANK-01");
    await user.click(paymentForm.getByRole("button", { name: "Record payment" }));

    await waitFor(() => {
      expect(createInvoicePayment).toHaveBeenCalledWith(invoiceId, {
        amount: "5.00",
        method: "BANK_TRANSFER",
        reference: "BANK-01",
        notes: null,
      });
    });

    cleanup();
    setRole("SALES");
    renderPage(<InvoicesPage />);
    expect(await screen.findByText("INV-2026-0001")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Details" }));
    const salesDetails = within(await screen.findByRole("dialog"));
    expect(
      salesDetails.queryByRole("button", { name: "Record payment" }),
    ).toBeNull();
  });

  it("confirms cancellation of a pending invoice", async () => {
    const user = userEvent.setup();
    renderPage(<InvoicesPage />);
    expect(await screen.findByText("INV-2026-0001")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Details" }));
    const details = within(await screen.findByRole("dialog"));
    await user.click(details.getByRole("button", { name: "Cancel invoice" }));
    const confirmation = within(screen.getAllByRole("dialog")[1]);
    await user.click(
      confirmation.getByRole("button", { name: "Cancel invoice" }),
    );
    await waitFor(() => expect(cancelInvoice).toHaveBeenCalledWith(invoiceId));
  });
});
