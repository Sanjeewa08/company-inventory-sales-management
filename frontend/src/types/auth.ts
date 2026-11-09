export const userRoles = [
  "ADMIN",
  "MANAGER",
  "STOREKEEPER",
  "SALES",
  "ACCOUNTANT",
] as const;

export type UserRole = (typeof userRoles)[number];

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branchId: string | null;
  isActive: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthenticatedUser;
}
