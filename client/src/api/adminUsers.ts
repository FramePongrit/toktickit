import { request } from "../lib/http.js";
import type { AdminUser, Role } from "../types/index.js";

export interface AdminUsersQuery {
  q?: string;
  role?: Role;
  active?: boolean;
}

export interface AdminUsersResult {
  data: AdminUser[];
}

export interface CreateAdminUserInput {
  fullName: string;
  email: string;
  role: Role;
  active: boolean;
  initialPassword: string;
  confirmation: string;
}

export interface EditAdminUserInput {
  fullName?: string;
  email?: string;
  role?: Role;
  active?: boolean;
}

export interface ResetAdminUserPasswordInput {
  initialPassword: string;
  confirmation: string;
}

export function fetchAdminUsers(query: AdminUsersQuery = {}): Promise<AdminUsersResult> {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.role) params.set("role", query.role);
  if (query.active !== undefined) params.set("active", String(query.active));
  const suffix = params.toString();
  return request<AdminUsersResult>(`/api/admin/users${suffix ? `?${suffix}` : ""}`);
}

export function createAdminUser(input: CreateAdminUserInput): Promise<{ user: AdminUser }> {
  return request<{ user: AdminUser }>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function editAdminUser(id: number, input: EditAdminUserInput): Promise<{ user: AdminUser }> {
  return request<{ user: AdminUser }>(`/api/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function resetAdminUserPassword(id: number, input: ResetAdminUserPasswordInput): Promise<{ user: AdminUser }> {
  return request<{ user: AdminUser }>(`/api/admin/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
