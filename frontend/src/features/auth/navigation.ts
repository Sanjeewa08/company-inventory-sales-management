import type { UserRole } from "../../types/auth";

export interface NavigationItem {
  label: string;
  path: string;
  initials: string;
  group: "Workspace" | "Management" | "Sales" | "Finance";
}

const navigationByRole: Record<UserRole, NavigationItem[]> = {
  ADMIN: [
    { label: "Dashboard", path: "/", initials: "DB", group: "Workspace" },
    { label: "Branches", path: "/branches", initials: "BR", group: "Management" },
    { label: "Users", path: "/users", initials: "US", group: "Management" },
    { label: "Categories", path: "/categories", initials: "CA", group: "Management" },
    { label: "Products", path: "/products", initials: "PR", group: "Management" },
    { label: "Stock", path: "/stock", initials: "ST", group: "Management" },
    { label: "Suppliers", path: "/suppliers", initials: "SU", group: "Management" },
    {
      label: "Purchase orders",
      path: "/purchase-orders",
      initials: "PO",
      group: "Management",
    },
    { label: "Customers", path: "/customers", initials: "CU", group: "Sales" },
    { label: "Quotations", path: "/quotations", initials: "QT", group: "Sales" },
    { label: "Invoices", path: "/invoices", initials: "IN", group: "Sales" },
    { label: "Alerts", path: "/alerts", initials: "AL", group: "Workspace" },
    {
      label: "Audit logs",
      path: "/audit-logs",
      initials: "AU",
      group: "Management",
    },
    { label: "Reports", path: "/reports", initials: "RE", group: "Finance" },
  ],
  MANAGER: [
    { label: "Dashboard", path: "/", initials: "DB", group: "Workspace" },
    { label: "Branches", path: "/branches", initials: "BR", group: "Management" },
    { label: "Categories", path: "/categories", initials: "CA", group: "Management" },
    { label: "Products", path: "/products", initials: "PR", group: "Management" },
    { label: "Stock", path: "/stock", initials: "ST", group: "Management" },
    { label: "Suppliers", path: "/suppliers", initials: "SU", group: "Management" },
    {
      label: "Purchase orders",
      path: "/purchase-orders",
      initials: "PO",
      group: "Management",
    },
    { label: "Customers", path: "/customers", initials: "CU", group: "Sales" },
    { label: "Quotations", path: "/quotations", initials: "QT", group: "Sales" },
    { label: "Invoices", path: "/invoices", initials: "IN", group: "Sales" },
    { label: "Alerts", path: "/alerts", initials: "AL", group: "Workspace" },
    { label: "Reports", path: "/reports", initials: "RE", group: "Finance" },
  ],
  STOREKEEPER: [
    { label: "Dashboard", path: "/", initials: "DB", group: "Workspace" },
    { label: "Branches", path: "/branches", initials: "BR", group: "Management" },
    { label: "Categories", path: "/categories", initials: "CA", group: "Management" },
    { label: "Products", path: "/products", initials: "PR", group: "Management" },
    { label: "Stock", path: "/stock", initials: "ST", group: "Management" },
    {
      label: "Purchase orders",
      path: "/purchase-orders",
      initials: "PO",
      group: "Management",
    },
    { label: "Alerts", path: "/alerts", initials: "AL", group: "Workspace" },
  ],
  SALES: [
    { label: "Dashboard", path: "/", initials: "DB", group: "Workspace" },
    { label: "Branches", path: "/branches", initials: "BR", group: "Management" },
    { label: "Categories", path: "/categories", initials: "CA", group: "Management" },
    { label: "Products", path: "/products", initials: "PR", group: "Management" },
    { label: "Stock", path: "/stock", initials: "ST", group: "Management" },
    { label: "Customers", path: "/customers", initials: "CU", group: "Sales" },
    { label: "Quotations", path: "/quotations", initials: "QT", group: "Sales" },
    { label: "Invoices", path: "/invoices", initials: "IN", group: "Sales" },
    { label: "Alerts", path: "/alerts", initials: "AL", group: "Workspace" },
  ],
  ACCOUNTANT: [
    { label: "Dashboard", path: "/", initials: "DB", group: "Workspace" },
    { label: "Invoices", path: "/invoices", initials: "IN", group: "Finance" },
    { label: "Alerts", path: "/alerts", initials: "AL", group: "Workspace" },
    { label: "Reports", path: "/reports", initials: "RE", group: "Finance" },
  ],
};

export function getNavigationItems(role: UserRole): NavigationItem[] {
  return navigationByRole[role];
}
