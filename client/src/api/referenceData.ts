import { request } from "../lib/http.js";
import type { DevRequester, ReferenceItem } from "../types/index.js";

// Named exports on their own module, never re-exported through src/api.ts:
// vi.spyOn cannot redefine an ESM re-exported binding, so a barrel would break
// both these tests and the Lab 1 test that spies on api.ts.

export function fetchCategories(): Promise<ReferenceItem[]> {
  return request<ReferenceItem[]>("/api/categories");
}

export function fetchRelatedSystems(): Promise<ReferenceItem[]> {
  return request<ReferenceItem[]>("/api/related-systems");
}

export function fetchDevRequesters(): Promise<DevRequester[]> {
  return request<DevRequester[]>("/api/dev-requesters");
}
