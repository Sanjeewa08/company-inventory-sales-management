const accessTokenKey = "inventory.access-token";

export function getAccessToken(): string | null {
  return window.localStorage.getItem(accessTokenKey);
}

export function setAccessToken(token: string): void {
  window.localStorage.setItem(accessTokenKey, token);
}

export function clearAccessToken(): void {
  window.localStorage.removeItem(accessTokenKey);
}
