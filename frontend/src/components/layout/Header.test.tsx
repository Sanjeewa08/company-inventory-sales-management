import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../features/auth/useAuth";
import { Header } from "./Header";

vi.mock("../../features/auth/useAuth", () => ({ useAuth: vi.fn() }));

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "e501fe6c-78bb-432a-b3b2-cfab4d08e8f3",
      name: "Alex Morgan",
      email: "alex@example.com",
      role: "ADMIN",
      branchId: null,
      isActive: true,
    },
    status: "authenticated",
    login: vi.fn(async () => {}),
    logout: vi.fn(),
  });
});

describe("Header", () => {
  it("provides an accessible sign-out name at every viewport size", () => {
    render(
      <MemoryRouter>
        <Header title="Dashboard" onMenuClick={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
  });
});
