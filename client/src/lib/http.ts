const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface FieldIssue {
  field: string;
  message: string;
}

/** A failed response, carrying enough detail for a screen to render field errors. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: FieldIssue[];

  constructor(status: number, code: string, message: string, details: FieldIssue[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** The message for one field, if the server reported one. */
  fieldMessage(field: string): string | undefined {
    return this.details.find((d) => d.field === field)?.message;
  }
}

// The CSRF token is deliberately process-local. It is supplied by AuthProvider
// after Login or /me bootstrap and is cleared on Logout; it never enters
// localStorage, a URL, or a cookie.
let csrfToken: string | null = null;
let authFailureHandler: ((error: ApiError) => void) | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

/** AuthProvider registers this to make expired/revoked sessions fail closed. */
export function setAuthFailureHandler(handler: ((error: ApiError) => void) | null): void {
  authFailureHandler = handler;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = await response.json();
    const error = body?.error;
    if (error?.code) {
      return new ApiError(response.status, error.code, error.message, error.details ?? []);
    }
  } catch {
    // A non-JSON error body is still a failure; fall through to the generic case.
  }
  return new ApiError(response.status, "UNEXPECTED", "Something went wrong. Please try again.");
}

/** Every API call carries the browser session; mutations also carry CSRF. */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (mutating && csrfToken) headers.set("X-CSRF-Token", csrfToken);

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    const error = await toApiError(response);
    if (error.code === "UNAUTHENTICATED" || error.code === "PASSWORD_CHANGE_REQUIRED") {
      authFailureHandler?.(error);
    }
    throw error;
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/**
 * Downloads a file and hands it to the browser.
 *
 * A plain <a href> cannot do this because the API is on a different origin and
 * the browser session must be included. Fetching to a blob also lets the
 * caller choose the filename from already-loaded safe metadata.
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, { credentials: "include" });

  if (!response.ok) {
    const error = await toApiError(response);
    if (error.code === "UNAUTHENTICATED" || error.code === "PASSWORD_CHANGE_REQUIRED") {
      authFailureHandler?.(error);
    }
    throw error;
  }

  const blobUrl = URL.createObjectURL(await response.blob());
  try {
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Without this the blob is retained for the lifetime of the page.
    URL.revokeObjectURL(blobUrl);
  }
}
