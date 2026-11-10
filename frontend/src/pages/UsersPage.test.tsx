import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../features/auth/useAuth";
import { listBranches } from "../features/stock/stockApi";
import {
  createUser,
  deactivateUser,
  listUsers,
  updateUser,
  type ManagedUser,
} from "../features/users/usersApi";
import { UsersPage } from "./UsersPage";

vi.mock("../features/auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../features/stock/stockApi", () => ({
  listBranches: vi.fn(),
}));
vi.mock("../features/users/usersApi", () => ({
  createUser: vi.fn(),
  deactivateUser: vi.fn(),
  listUsers: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock("../lib/api", () => ({
  getApiErrorMessage: (error: unknown, fallback?: string) =>
    error instanceof Error ? error.message : fallback ?? "Request failed.",
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const userId = "e501fe6c-78bb-432a-b3b2-cfab4d08e8f3";
const branchId = "d74a189c-ef06-4797-a394-357d764680c3";
const pagination = { page: 1, limit: 10, total: 1, totalPages: 1 };
const branch = { id: branchId, name: "Colombo", isActive: true };

const managedUser: ManagedUser = {
  id: userId,
  name: "Maya Perera",
  email: "maya@example.com",
  role: "SALES",
  branchId,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

function setRole(role: "ADMIN" | "MANAGER" | "SALES") {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "c78a9cc2-028b-4ab9-baa5-865e360145ee",
      name: "Admin",
      email: "admin@example.com",
      role,
      branchId: null,
      isActive: true,
    },
    status: "authenticated",
    login: vi.fn(async () => {}),
    logout: vi.fn(),
  });
}

function mockData(users = [managedUser]) {
  vi.mocked(listUsers).mockResolvedValue({ users, pagination });
  vi.mocked(listBranches).mockResolvedValue({
    branches: [branch],
    pagination,
  });
  vi.mocked(createUser).mockResolvedValue(managedUser);
  vi.mocked(updateUser).mockResolvedValue(managedUser);
  vi.mocked(deactivateUser).mockResolvedValue({
    ...managedUser,
    isActive: false,
  });
}

beforeEach(() => {
  vi.mocked(useAuth).mockReset();
  vi.mocked(listBranches).mockReset();
  vi.mocked(createUser).mockReset();
  vi.mocked(deactivateUser).mockReset();
  vi.mocked(listUsers).mockReset();
  vi.mocked(updateUser).mockReset();
  setRole("ADMIN");
  mockData();
});

afterEach(() => cleanup());

describe("user management", () => {
  it("searches and filters by supported fields", async () => {
    const user = userEvent.setup();
    render(<UsersPage />);
    expect(await screen.findByText("Maya Perera")).toBeVisible();
    await user.type(screen.getByLabelText("Name"), "Maya");
    await user.type(screen.getByLabelText("Email"), "maya@example.com");
    await user.selectOptions(screen.getByLabelText("Role"), "SALES");
    await user.selectOptions(screen.getByLabelText("Branch"), branchId);
    await user.selectOptions(screen.getByLabelText("Status"), "active");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(listUsers).toHaveBeenLastCalledWith({
        page: 1,
        limit: 10,
        name: "Maya",
        email: "maya@example.com",
        role: "SALES",
        branchId,
        isActive: true,
      });
    });
  });

  it("shows user details from the list without exposing credential fields", async () => {
    const user = userEvent.setup();
    render(<UsersPage />);
    await user.click(
      await screen.findByRole("button", { name: "Details" }),
    );
    const details = within(await screen.findByRole("dialog"));
    expect(details.getByText("maya@example.com")).toBeVisible();
    expect(details.getByText("Colombo")).toBeVisible();
    expect(details.queryByText(/password/i)).toBeNull();
    expect(details.queryByText(/passwordHash/i)).toBeNull();
  });

  it("validates the initial password and creates a user with a role and branch", async () => {
    const user = userEvent.setup();
    render(<UsersPage />);
    await user.click(await screen.findByRole("button", { name: "Create user" }));
    const form = within(screen.getByRole("dialog"));
    await user.type(form.getByLabelText("Name"), "New Account");
    await user.type(form.getByLabelText("Email"), "NEW@EXAMPLE.COM");
    await user.type(form.getByLabelText("Initial password"), "short");
    await user.selectOptions(form.getByLabelText("Role"), "MANAGER");
    await user.selectOptions(form.getByLabelText("Branch"), branchId);
    await user.click(form.getByRole("button", { name: "Create user" }));

    expect(
      await form.findByText("Password must be at least 8 characters"),
    ).toBeVisible();
    expect(createUser).not.toHaveBeenCalled();

    await user.clear(form.getByLabelText("Initial password"));
    await user.type(form.getByLabelText("Initial password"), "StrongPass123");
    await user.click(form.getByRole("button", { name: "Create user" }));
    await waitFor(() => {
      expect(createUser).toHaveBeenCalledWith({
        name: "New Account",
        email: "new@example.com",
        password: "StrongPass123",
        role: "MANAGER",
        branchId,
      });
    });
  });

  it("requires a branch for roles that use branch-scoped APIs", async () => {
    const user = userEvent.setup();
    render(<UsersPage />);
    await user.click(await screen.findByRole("button", { name: "Create user" }));
    const form = within(screen.getByRole("dialog"));
    await user.type(form.getByLabelText("Name"), "Branchless Sales");
    await user.type(form.getByLabelText("Email"), "branchless@example.com");
    await user.type(form.getByLabelText("Initial password"), "StrongPass123");
    await user.selectOptions(form.getByLabelText("Role"), "SALES");
    await user.click(form.getByRole("button", { name: "Create user" }));
    expect(
      await form.findByText("A branch is required for this role."),
    ).toBeVisible();
    expect(createUser).not.toHaveBeenCalled();

    await user.selectOptions(form.getByLabelText("Role"), "MANAGER");
    await user.click(form.getByRole("button", { name: "Create user" }));
    await waitFor(() =>
      expect(createUser).toHaveBeenCalledWith(
        expect.objectContaining({ role: "MANAGER", branchId: null }),
      ),
    );
  });

  it("edits user profile and role without offering password changes", async () => {
    const user = userEvent.setup();
    render(<UsersPage />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const form = within(screen.getByRole("dialog"));
    expect(form.queryByLabelText("Initial password")).toBeNull();
    await user.clear(form.getByLabelText("Name"));
    await user.type(form.getByLabelText("Name"), "Maya Silva");
    await user.selectOptions(form.getByLabelText("Role"), "ACCOUNTANT");
    await user.click(form.getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith(userId, {
        name: "Maya Silva",
        email: "maya@example.com",
        role: "ACCOUNTANT",
        branchId,
      });
    });
  });

  it("deactivates with confirmation and reactivates through the supported patch", async () => {
    const user = userEvent.setup();
    render(<UsersPage />);
    await user.click(await screen.findByRole("button", { name: "Deactivate" }));
    const confirmation = within(screen.getByRole("dialog"));
    await user.click(
      confirmation.getByRole("button", { name: "Deactivate user" }),
    );
    await waitFor(() => expect(deactivateUser).toHaveBeenCalledWith(userId));

    cleanup();
    vi.mocked(listUsers).mockResolvedValue({
      users: [{ ...managedUser, isActive: false }],
      pagination,
    });
    render(<UsersPage />);
    await user.click(await screen.findByRole("button", { name: "Activate" }));
    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith(userId, { isActive: true }),
    );
  });

  it("shows deactivation failures inside the confirmation dialog", async () => {
    vi.mocked(deactivateUser).mockRejectedValue(new Error("Request denied"));
    const user = userEvent.setup();
    render(<UsersPage />);
    await user.click(await screen.findByRole("button", { name: "Deactivate" }));
    const confirmation = within(screen.getByRole("dialog"));
    await user.click(
      confirmation.getByRole("button", { name: "Deactivate user" }),
    );
    expect(await confirmation.findByText("Request denied")).toBeVisible();
  });

  it("prevents non-admin access without requesting user data", async () => {
    setRole("MANAGER");
    render(<UsersPage />);
    expect(await screen.findByText("Access restricted")).toBeVisible();
    expect(listUsers).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Create user" })).toBeNull();
  });

  it("reports user list API failures with a retry action", async () => {
    vi.mocked(listUsers).mockRejectedValue(new Error("Service unavailable"));
    render(<UsersPage />);
    expect(await screen.findByText("Users unavailable")).toBeVisible();
    expect(screen.getByText("Service unavailable")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(2));
  });
});
