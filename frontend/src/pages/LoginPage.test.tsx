import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosHeaders } from "axios";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../features/auth/AuthProvider";
import { apiClient } from "../lib/api";
import { LoginPage } from "./LoginPage";

vi.mock("../lib/api", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
  sessionExpiredEvent: "inventory:session-expired",
  getApiErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Unable to sign in.",
  notifyApiError: vi.fn(),
}));

const userProfile = {
  id: "c345d7dc-cb44-4331-b65d-4c56a15aac2b",
  name: "Alex Morgan",
  email: "alex@example.com",
  role: "SALES" as const,
  branchId: "e501fe6c-78bb-432a-b3b2-cfab4d08e8f3",
  isActive: true,
};

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <Routes>
          <Route element={<LoginPage />} path="/login" />
          <Route element={<h1>Dashboard workspace</h1>} path="/" />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(apiClient.post).mockReset();
});

describe("login page", () => {
  it("submits credentials, stores the returned token, and opens the dashboard", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { token: "signed-access-token", user: userProfile },
      status: 200,
      statusText: "OK",
      headers: {},
      config: { headers: new AxiosHeaders() },
    });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(await screen.findByLabelText("Work email"), "alex@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("heading", { name: "Dashboard workspace" })).toBeVisible();
    expect(apiClient.post).toHaveBeenCalledWith("/auth/login", {
      email: "alex@example.com",
      password: "correct-password",
    });
    expect(window.localStorage.getItem("inventory.access-token")).toBe(
      "signed-access-token",
    );
  });

  it("shows Zod validation messages and does not call the API for invalid input", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(await screen.findByRole("button", { name: /sign in/i }));

    expect(
      await screen.findByText("Enter a valid email address"),
    ).toBeVisible();
    expect(screen.getByText("Enter your password")).toBeVisible();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("shows the backend login error without leaving the form", async () => {
    vi.mocked(apiClient.post).mockRejectedValue(
      new Error("Email or password is incorrect"),
    );
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(await screen.findByLabelText("Work email"), "alex@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Email or password is incorrect");
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });
});
