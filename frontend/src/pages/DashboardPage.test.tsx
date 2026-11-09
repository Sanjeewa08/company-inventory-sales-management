import { AxiosHeaders, type AxiosResponse } from "axios";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../features/auth/useAuth";
import { apiClient } from "../lib/api";
import { DashboardPage } from "./DashboardPage";

vi.mock("../features/auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/api", () => ({
  apiClient: { get: vi.fn() },
  getApiErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Dashboard data could not be loaded.",
}));

const branchId = "e501fe6c-78bb-432a-b3b2-cfab4d08e8f3";
const now = new Date();

function axiosResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
}

function setRole(
  role: "ADMIN" | "MANAGER" | "STOREKEEPER" | "SALES" | "ACCOUNTANT",
) {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "c345d7dc-cb44-4331-b65d-4c56a15aac2b",
      name: "Alex Morgan",
      email: "alex@example.com",
      role,
      branchId: role === "ADMIN" ? null : branchId,
      isActive: true,
    },
    status: "authenticated",
    login: vi.fn(async () => {}),
    logout: vi.fn(),
  });
}

function invoice(status: "PENDING" | "PARTIAL" | "PAID", offset: number) {
  return {
    id: `invoice-${status.toLowerCase()}`,
    number: `INV-2026-${String(offset).padStart(4, "0")}`,
    status,
    issuedAt: new Date(now.getTime() - offset * 60_000).toISOString(),
    total: `${offset * 10}.00`,
    customer: { name: `Customer ${offset}` },
    branch: { name: "Colombo" },
  };
}

function mockDashboardResponses() {
  vi.mocked(apiClient.get).mockImplementation((url, config) => {
    if (url === "/products") {
      const isActive = (config?.params as { isActive?: boolean } | undefined)
        ?.isActive;
      return Promise.resolve(
        axiosResponse({
          products: [],
          pagination: { total: isActive ? 45 : 3 },
        }),
      ) as never;
    }
    if (url === "/alerts/low-stock") {
      return Promise.resolve(
        axiosResponse({
          alerts: [
            {
              id: "alert-1",
              message: "USB-C Charger is low on stock (2 remaining).",
              createdAt: now.toISOString(),
              product: { name: "USB-C Charger", sku: "ELE-001" },
              branch: { name: "Colombo" },
            },
          ],
          pagination: { total: 2 },
        }),
      ) as never;
    }
    if (url === "/reports/sales") {
      return Promise.resolve(
        axiosResponse({
          sales: [
            {
              period: now.toISOString(),
              count: 2,
              subtotal: "100.25",
              discount: "0.00",
              tax: "0.00",
              total: "100.25",
            },
            {
              period: new Date(now.getTime() - 86_400_000).toISOString(),
              count: 1,
              subtotal: "25.00",
              discount: "0.00",
              tax: "0.00",
              total: "25.00",
            },
          ],
        }),
      ) as never;
    }
    if (url === "/reports/stock-valuation") {
      return Promise.resolve(
        axiosResponse({
          stockValuation: {
            grandTotal: { quantity: 23, value: "600.00" },
          },
        }),
      ) as never;
    }
    if (url === "/invoices") {
      const status = (config?.params as { status?: string } | undefined)
        ?.status;
      const offsetByStatus: Record<string, number> = {
        PENDING: 1,
        PARTIAL: 2,
        PAID: 3,
      };
      const currentStatus = status as "PENDING" | "PARTIAL" | "PAID";
      const offset = offsetByStatus[currentStatus];
      return Promise.resolve(
        axiosResponse({
          invoices: [invoice(currentStatus, offset)],
          pagination: { total: 1 },
        }),
      ) as never;
    }
    if (url === "/stock") {
      return Promise.resolve(
        axiosResponse({ stock: [], pagination: { total: 31 } }),
      ) as never;
    }
    throw new Error(`Unexpected dashboard endpoint: ${url}`);
  });
}

beforeEach(() => {
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(useAuth).mockReset();
  setRole("ADMIN");
});

describe("dashboard data", () => {
  it("renders real report, product, alert, and recent invoice data", async () => {
    mockDashboardResponses();
    render(<DashboardPage />);

    expect(await screen.findByText("48")).toBeVisible();
    expect(screen.getByText("125.25")).toBeVisible();
    expect(screen.getByText("600.00")).toBeVisible();
    expect(screen.getByText("2", { selector: "span" })).toBeVisible();
    expect(screen.getByText("USB-C Charger")).toBeVisible();
    expect(screen.getByText("Customer 1")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Sales overview" })).toBeVisible();

    expect(apiClient.get).toHaveBeenCalledWith(
      "/reports/sales",
      expect.objectContaining({
        params: expect.objectContaining({ groupBy: "day" }),
      }),
    );
    expect(apiClient.get).toHaveBeenCalledWith(
      "/reports/stock-valuation",
    );
  });

  it("uses branch-scoped invoice data for SALES without calling reports", async () => {
    setRole("SALES");
    mockDashboardResponses();
    render(<DashboardPage />);

    expect(
      await screen.findByText("Invoices · last 30 days"),
    ).toBeVisible();
    expect(screen.getByText("3")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Sales overview" })).toBeNull();
    expect(apiClient.get).not.toHaveBeenCalledWith(
      "/reports/sales",
      expect.anything(),
    );
    expect(apiClient.get).not.toHaveBeenCalledWith(
      "/reports/stock-valuation",
    );
    expect(apiClient.get).toHaveBeenCalledWith(
      "/invoices",
      expect.objectContaining({
        params: expect.objectContaining({
          status: "PENDING",
          startDate: expect.any(String),
          endDate: expect.any(String),
        }),
      }),
    );
  });

  it("shows finance reports to an ACCOUNTANT", async () => {
    setRole("ACCOUNTANT");
    mockDashboardResponses();
    render(<DashboardPage />);

    expect(await screen.findByText("125.25")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Sales overview" })).toBeVisible();
    expect(apiClient.get).toHaveBeenCalledWith(
      "/reports/sales",
      expect.anything(),
    );
    expect(apiClient.get).toHaveBeenCalledWith(
      "/reports/stock-valuation",
    );
  });

  it("shows branch stock and empty alerts for a STOREKEEPER", async () => {
    setRole("STOREKEEPER");
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === "/products") {
        return Promise.resolve(
          axiosResponse({ products: [], pagination: { total: 0 } }),
        ) as never;
      }
      if (url === "/alerts/low-stock") {
        return Promise.resolve(
          axiosResponse({ alerts: [], pagination: { total: 0 } }),
        ) as never;
      }
      if (url === "/stock") {
        return Promise.resolve(
          axiosResponse({ stock: [], pagination: { total: 0 } }),
        ) as never;
      }
      throw new Error(`Unexpected dashboard endpoint: ${url}`);
    });
    render(<DashboardPage />);

    expect(await screen.findByText("No active low-stock alerts.")).toBeVisible();
    expect(screen.getByText("Tracked stock lines")).toBeVisible();
    expect(apiClient.get).toHaveBeenCalledWith(
      "/stock",
      expect.objectContaining({ params: { page: 1, limit: 1 } }),
    );
    expect(apiClient.get).not.toHaveBeenCalledWith(
      "/invoices",
      expect.anything(),
    );
    expect(apiClient.get).not.toHaveBeenCalledWith(
      "/reports/sales",
      expect.anything(),
    );
  });

  it("shows empty states when the permitted endpoints have no records", async () => {
    setRole("MANAGER");
    vi.mocked(apiClient.get).mockImplementation((url) => {
      if (url === "/products") {
        return Promise.resolve(
          axiosResponse({ products: [], pagination: { total: 0 } }),
        ) as never;
      }
      if (url === "/alerts/low-stock") {
        return Promise.resolve(
          axiosResponse({ alerts: [], pagination: { total: 0 } }),
        ) as never;
      }
      if (url === "/reports/sales") {
        return Promise.resolve(axiosResponse({ sales: [] })) as never;
      }
      if (url === "/reports/stock-valuation") {
        return Promise.resolve(
          axiosResponse({
            stockValuation: { grandTotal: { quantity: 0, value: "0.00" } },
          }),
        ) as never;
      }
      if (url === "/invoices") {
        return Promise.resolve(
          axiosResponse({ invoices: [], pagination: { total: 0 } }),
        ) as never;
      }
      throw new Error(`Unexpected dashboard endpoint: ${url}`);
    });
    render(<DashboardPage />);

    expect(await screen.findByText("No sales during the last 30 days.")).toBeVisible();
    expect(screen.getByText("No active low-stock alerts.")).toBeVisible();
    expect(screen.getByText("No sales in the last 30 days.")).toBeVisible();
  });

  it("shows a loading state while dashboard requests are pending", () => {
    vi.mocked(apiClient.get).mockImplementation(
      () => new Promise(() => {}) as never,
    );
    render(<DashboardPage />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading dashboard data",
    );
  });

  it("shows an API error and retries the dashboard requests", async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error("Service unavailable"));
    render(<DashboardPage />);

    expect(await screen.findByText("Service unavailable")).toBeVisible();
    const callsBeforeRetry = vi.mocked(apiClient.get).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(vi.mocked(apiClient.get).mock.calls.length).toBeGreaterThan(
        callsBeforeRetry,
      );
    });
    expect(await screen.findByText("Service unavailable")).toBeVisible();
  });
});
