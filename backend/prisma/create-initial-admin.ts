import bcrypt from "bcryptjs";
import { StringDecoder } from "node:string_decoder";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/prisma/client";
import { writeAuditLog } from "../src/modules/audit/audit.service";
import { createUserSchema } from "../src/modules/users/users.schema";
import {
  addSensitiveValue,
  collectSensitiveValues,
  getUnexpectedErrorDiagnostic,
} from "./initial-admin-diagnostics";

const initialAdminLockKey = 202_611_091;

class InitialAdminSetupError extends Error {}

async function readHiddenPassword(prompt: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new InitialAdminSetupError(
      "Initial admin creation requires an interactive terminal.",
    );
  }

  stdout.write(prompt);
  const wasRaw = stdin.isRaw;
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder("utf8");
    let password = "";
    let settled = false;

    const cleanup = () => {
      stdin.off("data", onData);
      stdin.off("end", onEnd);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write("\n");
    };

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(password);
    };

    const onData = (chunk: Buffer) => {
      for (const character of decoder.write(chunk)) {
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u0003") {
          finish(
            new InitialAdminSetupError("Initial admin creation cancelled."),
          );
          return;
        }
        if (character === "\u0008" || character === "\u007f") {
          password = Array.from(password).slice(0, -1).join("");
        } else if (character.charCodeAt(0) >= 0x20) {
          password += character;
        }
      }
    };

    const onEnd = () => {
      finish(new InitialAdminSetupError("Terminal input ended unexpectedly."));
    };

    stdin.on("data", onData);
    stdin.once("end", onEnd);
  });
}

async function promptForAdmin() {
  const terminal = createInterface({ input: stdin, output: stdout });
  let name: string;
  let email: string;

  try {
    name = (await terminal.question("Administrator name: ")).trim();
    email = await terminal.question("Administrator email: ");
  } finally {
    terminal.close();
  }

  const password = await readHiddenPassword("Password (input hidden): ");
  const confirmation = await readHiddenPassword(
    "Confirm password (input hidden): ",
  );
  if (password !== confirmation) {
    throw new InitialAdminSetupError("The passwords do not match.");
  }

  const result = createUserSchema.safeParse({
    name,
    email,
    password,
    role: "ADMIN",
    branchId: null,
  });
  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message);
    throw new InitialAdminSetupError(
      `Invalid administrator details: ${messages.join("; ")}`,
    );
  }
  return result.data;
}

async function createInitialAdmin(sensitiveValues: Set<string>) {
  if (process.env.NODE_ENV !== "production") {
    throw new InitialAdminSetupError(
      "Initial admin creation is available only in production mode.",
    );
  }

  if (!stdin.isTTY || !stdout.isTTY) {
    throw new InitialAdminSetupError(
      "Initial admin creation requires an interactive terminal.",
    );
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  if (existingAdmin) {
    throw new InitialAdminSetupError(
      "An ADMIN account already exists; no account was created.",
    );
  }

  const input = await promptForAdmin();
  addSensitiveValue(sensitiveValues, input.password);
  const passwordHash = await bcrypt.hash(input.password, 12);
  addSensitiveValue(sensitiveValues, passwordHash);

  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(${initialAdminLockKey})
    `;

    const admin = await transaction.user.findFirst({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    if (admin) {
      throw new InitialAdminSetupError(
        "An ADMIN account already exists; no account was created.",
      );
    }

    const user = await transaction.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: "ADMIN",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        branchId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await writeAuditLog(
      {
        userId: null,
        action: "CREATE",
        entity: "User",
        entityId: user.id,
        after: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          branchId: user.branchId,
          isActive: user.isActive,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
      },
      transaction,
    );
  });
}

async function main() {
  const sensitiveValues = collectSensitiveValues(
    Object.entries(process.env)
      .filter(([name]) =>
        /(?:DATABASE_URL|DATABASE_URI|DB_URL|CONNECTION_STRING|PASSWORD|PASSWD|PWD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|CREDENTIAL|AUTHORIZATION)/i.test(
          name,
        ),
      )
      .map(([, value]) => value),
  );

  try {
    await createInitialAdmin(sensitiveValues);
    console.info("Initial ADMIN account created successfully.");
  } catch (error) {
    if (error instanceof InitialAdminSetupError) {
      console.error(error.message);
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      console.error(
        "A user with that email already exists; no ADMIN account was created.",
      );
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      console.error(
        "The database schema is missing or outdated; apply the committed migrations first.",
      );
    } else {
      console.error(
        "Unexpected initial ADMIN creation error:",
        JSON.stringify(getUnexpectedErrorDiagnostic(error, sensitiveValues)),
      );
    }
    process.exitCode = 1;
  } finally {
    try {
      await prisma.$disconnect();
    } catch {
      console.error("Could not close the database connection cleanly.");
      process.exitCode = 1;
    }
  }
}

void main();
