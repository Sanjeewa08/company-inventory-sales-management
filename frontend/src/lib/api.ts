import axios from "axios";
import { toast } from "sonner";
import { clearAccessToken, getAccessToken } from "./authToken";

export const sessionExpiredEvent = "inventory:session-expired";

interface ApiErrorBody {
  error?: {
    message?: string;
  };
}

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ??
  "/api";

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: { "Content-Type": "application/json" },
});

export function getApiErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.data?.error?.message ?? error.message ?? fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export function notifyApiError(error: unknown, fallback?: string): void {
  toast.error(getApiErrorMessage(error, fallback));
}

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const requestUrl = error.config?.url ?? "";
      const isLoginRequest = requestUrl.endsWith("/auth/login");
      const isMeRequest = requestUrl.endsWith("/auth/me");

      if (error.response?.status === 401 && !isLoginRequest) {
        const hadToken = getAccessToken() !== null;
        clearAccessToken();
        if (hadToken) {
          window.dispatchEvent(new Event(sessionExpiredEvent));
        }
      }
      if (!isLoginRequest && !isMeRequest) notifyApiError(error);
    }
    return Promise.reject(error);
  },
);


