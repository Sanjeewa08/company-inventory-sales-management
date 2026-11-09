import { createContext } from "react";
import type {
  AuthenticatedUser,
  LoginCredentials,
} from "../../types/auth";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  user: AuthenticatedUser | null;
  status: AuthStatus;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
