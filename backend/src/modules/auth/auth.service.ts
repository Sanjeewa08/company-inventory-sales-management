import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { loadConfig } from "../../config";
import type { UserRole } from "../../generated/prisma/enums";
import { prisma } from "../../prisma/client";
import { writeAuditLog } from "../audit/audit.service";
import type { ChangePasswordInput, LoginInput } from "./auth.schema";
import { AppError } from "../../utils/app-error";

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branchId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  branchId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function login(
  input: LoginInput,
  ip: string | undefined,
): Promise<{ token: string; user: SafeUser }> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...userSelect, passwordHash: true },
  });
  if (
    !user ||
    !user.isActive ||
    !(await bcrypt.compare(input.password, user.passwordHash))
  ) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Email or password is incorrect",
    );
  }

  const safeUser: SafeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    branchId: user.branchId,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
  const token = jwt.sign(
    { role: user.role, branchId: user.branchId },
    loadConfig(process.env).jwtSecret,
    { subject: user.id, expiresIn: "1h" },
  );
  await writeAuditLog({
    userId: user.id,
    action: "LOGIN",
    entity: "User",
    entityId: user.id,
    after: { email: user.email },
    ip,
  });
  return { token, user: safeUser };
}

export async function getActiveUserById(
  id: string,
): Promise<Pick<
  SafeUser,
  "id" | "name" | "email" | "role" | "branchId" | "isActive"
> | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      branchId: true,
      isActive: true,
    },
  });
  return user?.isActive ? user : null;
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  ip: string | undefined,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true, isActive: true },
  });
  if (
    !user?.isActive ||
    !(await bcrypt.compare(input.currentPassword, user.passwordHash))
  ) {
    throw new AppError(
      400,
      "INVALID_PASSWORD",
      "Current password is incorrect",
    );
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 12);
  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await writeAuditLog(
      {
        userId,
        action: "UPDATE",
        entity: "User",
        entityId: userId,
        before: { passwordChanged: false },
        after: { passwordChanged: true },
        ip,
      },
      transaction,
    );
  });
}
