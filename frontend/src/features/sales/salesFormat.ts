export function parseMoneyCents(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) {
    throw new Error("The server returned an invalid monetary amount.");
  }
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return BigInt(match[1]) * 100n + BigInt(fraction);
}

export function formatMoneyCents(value: bigint): string {
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return `${whole.toLocaleString()}.${fraction}`;
}

export function formatMoney(value: string): string {
  return formatMoneyCents(parseMoneyCents(value));
}

export function dateInputToIso(value: string, endOfDay = false): string | null {
  if (!value) return null;
  const time = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  return new Date(`${value}${time}`).toISOString();
}

export function formatDate(value: string | null, withTime = false): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}
