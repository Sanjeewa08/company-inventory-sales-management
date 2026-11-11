const urlPattern = /\b[a-z][a-z\d+.-]*:\/\/[^\s"'`<>]+/gi;
const credentialAssignmentPattern =
  /\b[A-Z0-9_]*(?:DATABASE_URL|DATABASE_URI|DB_URL|CONNECTION_STRING|PASSWORD|PASSWD|PWD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|CREDENTIAL|AUTHORIZATION)[A-Z0-9_]*\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const bcryptHashPattern = /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g;
const jwtPattern = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;

export interface UnexpectedErrorDiagnostic {
  name: string;
  prismaCode?: string;
  message: string;
}

export function collectSensitiveValues(
  values: readonly (string | undefined)[],
): Set<string> {
  const sensitiveValues = new Set<string>();

  for (const value of values) {
    addSensitiveValue(sensitiveValues, value);
    if (!value) continue;

    try {
      const parsed = new URL(value);
      addSensitiveValue(sensitiveValues, parsed.username);
      addSensitiveValue(sensitiveValues, parsed.password);
      addSensitiveValue(sensitiveValues, decodeURIComponent(parsed.username));
      addSensitiveValue(sensitiveValues, decodeURIComponent(parsed.password));
    } catch {
      // Non-URL values, including secrets, are already included above.
    }
  }

  return sensitiveValues;
}

export function addSensitiveValue(
  sensitiveValues: Set<string>,
  value: string | undefined,
): void {
  if (!value) return;
  sensitiveValues.add(value);
  sensitiveValues.add(encodeURIComponent(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sanitize(value: string, sensitiveValues: Set<string>): string {
  let sanitized = value;
  for (const sensitiveValue of [...sensitiveValues].sort(
    (left, right) => right.length - left.length,
  )) {
    if (sensitiveValue) {
      sanitized = sanitized.split(sensitiveValue).join("[REDACTED]");
    }
  }

  return sanitized
    .replace(urlPattern, "[REDACTED_URL]")
    .replace(credentialAssignmentPattern, "$1[REDACTED]")
    .replace(bcryptHashPattern, "[REDACTED_HASH]")
    .replace(jwtPattern, "[REDACTED_TOKEN]")
    .replace(bearerPattern, "Bearer [REDACTED_TOKEN]");
}

export function getUnexpectedErrorDiagnostic(
  error: unknown,
  sensitiveValues: Set<string>,
): UnexpectedErrorDiagnostic {
  const record = isRecord(error) ? error : undefined;
  const name =
    typeof record?.name === "string"
      ? record.name
      : error instanceof Error
        ? error.name
        : "UnknownError";
  const message =
    error instanceof Error
      ? error.message
      : typeof record?.message === "string"
        ? record.message
        : typeof error === "string"
          ? error
          : "Unknown error";
  const code = typeof record?.code === "string" ? record.code : undefined;

  return {
    name: sanitize(name, sensitiveValues).slice(0, 100),
    ...(code
      ? { prismaCode: sanitize(code, sensitiveValues).slice(0, 40) }
      : {}),
    message: sanitize(message, sensitiveValues).slice(0, 500),
  };
}
