import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiClient, sessionExpiredEvent } from "../../lib/api";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "../../lib/authToken";
import type {
  LoginCredentials,
  LoginResponse,
} from "../../types/auth";
import { AuthContext, type AuthStatus } from "./AuthContext";
import type { AuthenticatedUser } from "../../types/auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>(() =>
    getAccessToken() ? "loading" : "unauthenticated",
  );

  useEffect(() => {
    const handleExpiredSession = () => {
      setUser(null);
      setStatus("unauthenticated");
    };
    window.addEventListener(sessionExpiredEvent, handleExpiredSession);

    if (!getAccessToken()) {
      return () =>
        window.removeEventListener(sessionExpiredEvent, handleExpiredSession);
    }

    void apiClient
      .get<{ user: AuthenticatedUser }>("/auth/me")
      .then(({ data }) => {
        setUser(data.user);
        setStatus("authenticated");
      })
      .catch(() => {
        clearAccessToken();
        setUser(null);
        setStatus("unauthenticated");
      });

    return () =>
      window.removeEventListener(sessionExpiredEvent, handleExpiredSession);
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const { data } = await apiClient.post<LoginResponse>(
      "/auth/login",
      credentials,
    );
    setAccessToken(data.token);
    setUser(data.user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(() => {
    clearAccessToken();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(
    () => ({ user, status, login, logout }),
    [user, status, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
