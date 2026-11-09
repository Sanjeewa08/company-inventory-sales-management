import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Sidebar } from "./Sidebar";

function renderSidebar(role: "ADMIN" | "MANAGER" | "STOREKEEPER" | "SALES" | "ACCOUNTANT") {
  return render(
    <MemoryRouter>
      <Sidebar onClose={() => undefined} open role={role} />
    </MemoryRouter>,
  );
}

describe("role-based navigation", () => {
  it("shows admin-only navigation to admins", () => {
    renderSidebar("ADMIN");

    expect(screen.getByRole("link", { name: "Users" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Audit logs" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Reports" })).toBeVisible();
  });

  it("limits accountants to their read-only finance and alert sections", () => {
    renderSidebar("ACCOUNTANT");

    expect(screen.getByRole("link", { name: "Invoices" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Reports" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Alerts" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Purchase orders" }),
    ).not.toBeInTheDocument();
  });

  it("shows branch stock and purchasing navigation to storekeepers", () => {
    renderSidebar("STOREKEEPER");

    expect(screen.getByRole("link", { name: "Stock" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Purchase orders" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Quotations" }),
    ).not.toBeInTheDocument();
  });

  it("keeps reports and user management out of sales navigation", () => {
    renderSidebar("SALES");

    expect(screen.getByRole("link", { name: "Customers" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Quotations" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Invoices" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Reports" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });
});
