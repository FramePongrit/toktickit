import { request } from "../lib/http.js";
import type { SafeUser } from "../types/index.js";

export interface AuthResponse {
  user: SafeUser;
  csrfToken: string;
}

export function login(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function fetchCurrentUser(): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/me");
}

export function logout(): Promise<void> {
  return request<void>("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmation: string
): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword, confirmation }),
  });
}
