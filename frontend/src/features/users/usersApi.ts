import { apiClient } from "../../lib/api";
import type { Pagination } from "../catalog/catalogApi";
import type { UserRole } from "../../types/auth";

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branchId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserListParams {
  page: number;
  limit: number;
  name?: string;
  email?: string;
  role?: UserRole;
  branchId?: string;
  isActive?: boolean;
}

export interface UserListResponse {
  users: ManagedUser[];
  pagination: Pagination;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  branchId: string | null;
}

export interface UpdateUserInput {
  name: string;
  email: string;
  role: UserRole;
  branchId: string | null;
}

export async function listUsers(
  params: UserListParams,
): Promise<UserListResponse> {
  const { data } = await apiClient.get<UserListResponse>("/users", { params });
  return data;
}

export async function createUser(input: CreateUserInput): Promise<ManagedUser> {
  const { data } = await apiClient.post<{ user: ManagedUser }>("/users", input);
  return data.user;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput | { isActive: true },
): Promise<ManagedUser> {
  const { data } = await apiClient.patch<{ user: ManagedUser }>(
    `/users/${id}`,
    input,
  );
  return data.user;
}

export async function deactivateUser(id: string): Promise<ManagedUser> {
  const { data } = await apiClient.delete<{ user: ManagedUser }>(
    `/users/${id}`,
  );
  return data.user;
}
