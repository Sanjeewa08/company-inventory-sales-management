import { fireEvent, render, screen } from "@testing-library/react";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../../lib/api";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "../../lib/authToken";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./useAuth";

vi.mock("../../lib/api", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
  sessionExpiredEvent: "inventory:session-expired",
}));

const authenticatedUser = {
  id: "e501fe6c-78bb-432a-b3b2-cfab4d08e8f3",
  name: "Alex Morgan",
  email: "alex@example.com",
  role: "ADMIN" as const,
  branchId: null,
  isActive: true,
};

function AuthStatus() {
  const { status, logout } = useAuth();
  return (
    <div>
      <span>{status}</span>
      <button onClick={logout} type="button">
        Logout test
      </button>
    </div>
  );
}

beforeEach(() => {
  clearAccessToken();
  vi.mocked(apiClient.get).mockReset();
  vi.mocked(apiClient.post).mockReset();
});

describe("AuthProvider session lifecycle", () => {
  it("preserves the token when session restoration fails due to a network error", async () => {
    setAccessToken("still-valid-token");
    vi.mocked(apiClient.get).mockRejectedValue(new Error("Network unavailable"));

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );

    expect(await screen.findByText("unauthenticated")).toBeVisible();
    expect(getAccessToken()).toBe("still-valid-token");
  });

  it("clears the token when session restoration returns 401", async () => {
    setAccessToken("expired-token");
    const config = { headers: new AxiosHeaders() };
    vi.mocked(apiClient.get).mockRejectedValue(
      new AxiosError(
        "Unauthorized",
        "ERR_BAD_REQUEST",
        config,
        undefined,
        {
          data: {},
          status: 401,
          statusText: "Unauthorized",
          headers: {},
          config,
        },
      ),
    );

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );

    expect(await screen.findByText("unauthenticated")).toBeVisible();
    expect(getAccessToken()).toBeNull();
  });

  it("restores the current user and clears the token on logout", async () => {
    setAccessToken("valid-token");
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { user: authenticatedUser },
    });

    render(
      <AuthProvider>
        <AuthStatus />
      </AuthProvider>,
    );

    expect(await screen.findByText("authenticated")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Logout test" }));
    expect(screen.getByText("unauthenticated")).toBeVisible();
    expect(getAccessToken()).toBeNull();
  });
});
