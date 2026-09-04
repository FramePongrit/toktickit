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

/**
 * The selected requester id, held here rather than read from React context,
 * because these functions are not components and cannot call hooks.
 * RequesterProvider keeps it in step with the context.
 *
 * Lab 3 replaces this with an auth token and changes the header below; no
 * screen or API function changes.
 */
let currentRequesterId: number | null = null;

export function setRequesterId(id: number | null): void {
  currentRequesterId = id;
}

export function getRequesterId(): number | null {
  return currentRequesterId;
}

function requesterHeader(): Record<string, string> {
  return currentRequesterId === null ? {} : { "X-Requester-Id": String(currentRequesterId) };
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

/** Every JSON call goes through here, so the identity header is never forgotten. */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body !== undefined && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...requesterHeader(),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/**
 * Downloads a file and hands it to the browser.
 *
 * A plain <a href> cannot do this: anchor navigation cannot set the
 * X-Requester-Id header, and the API is on a different origin, so the request
 * would fail the ownership check. Fetching to a blob is what lets the header
 * travel. The filename comes from metadata the caller already holds, which
 * avoids needing Content-Disposition exposed through CORS.
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, { headers: requesterHeader() });

  if (!response.ok) {
    throw await toApiError(response);
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
