import type { AuthenticatedUser } from "./authenticate";
import { AppError } from "../utils/app-error";

export type BranchScopedUser = Pick<AuthenticatedUser, "branchId" | "role">;

export function withBranchScope<
  T extends { branchId?: string | null } & Record<string, unknown>,
>(user: BranchScopedUser, filters: T): T {
  if (user.role === "ADMIN" || user.role === "MANAGER") {
    return filters;
  }
  if (!user.branchId) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "A branch must be assigned to this user",
    );
  }
  if (
    filters.branchId !== undefined &&
    filters.branchId !== null &&
    filters.branchId !== user.branchId
  ) {
    throw new AppError(403, "FORBIDDEN", "Access to this branch is forbidden");
  }
  return { ...filters, branchId: user.branchId };
}
