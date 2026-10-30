import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile, request, setAuthFailureHandler, setCsrfToken } from "../../src/lib/http.js";

function unauthenticatedResponse(): Response {
  return {
    ok: false,
    status: 401,
    json: async () => ({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } }),
  } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => {
  vi.unstubAllGlobals();
  setAuthFailureHandler(null);
  setCsrfToken(null);
});

describe("HTTP authentication failures across aborted requests", () => {
  it("forwards an active session 401 to the sign-out handler", async () => {
    setCsrfToken("active-session");
    const authFailure = vi.fn();
    setAuthFailureHandler(authFailure);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(unauthenticatedResponse()));

    await expect(request("/api/staff/dashboard")).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(authFailure).toHaveBeenCalledOnce();
  });

  it("clears the active session when an aborted request resolves with 401", async () => {
    setCsrfToken("active-session");
    const authFailure = vi.fn();
    setAuthFailureHandler(authFailure);
    const response = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => response.promise));
    const controller = new AbortController();

    const pending = request("/api/staff/dashboard", { signal: controller.signal });
    controller.abort();
    response.resolve(unauthenticatedResponse());

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(authFailure).toHaveBeenCalledOnce();
    expect(authFailure.mock.calls[0][0]).toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });

  it.each([
    ["a different user signs in", "old-user-session", "new-user-session"],
    ["the same user signs out and back in", "same-user-session", "same-user-session"],
  ])("ignores an aborted 401 from an old session when %s", async (_scenario, oldToken, newToken) => {
    setCsrfToken(oldToken);
    const authFailure = vi.fn();
    setAuthFailureHandler(authFailure);
    const response = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => response.promise));
    const controller = new AbortController();

    const pending = request("/api/staff/dashboard", { signal: controller.signal });
    setCsrfToken(null);
    setCsrfToken(newToken);
    controller.abort();
    response.resolve(unauthenticatedResponse());

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(authFailure).not.toHaveBeenCalled();
  });

  it("does not sign out the new session when an old attachment download returns 401", async () => {
    setCsrfToken("old-download-session");
    const authFailure = vi.fn();
    setAuthFailureHandler(authFailure);
    const response = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => response.promise));

    const pending = downloadFile("/api/tickets/1/attachments/2/download", "attachment.txt");
    setCsrfToken(null);
    setCsrfToken("new-download-session");
    response.resolve(unauthenticatedResponse());

    await expect(pending).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(authFailure).not.toHaveBeenCalled();
  });

  it("checks the session again after an old 401 response body finishes parsing", async () => {
    setCsrfToken("old-body-session");
    const authFailure = vi.fn();
    setAuthFailureHandler(authFailure);
    const body = deferred<{ error: { code: string; message: string } }>();
    const bodyStarted = deferred<void>();
    const response = {
      ok: false,
      status: 401,
      json: () => {
        bodyStarted.resolve();
        return body.promise;
      },
    } as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const pending = request("/api/staff/dashboard");
    await bodyStarted.promise;
    setCsrfToken(null);
    setCsrfToken("new-body-session");
    body.resolve({ error: { code: "UNAUTHENTICATED", message: "The old session expired." } });

    await expect(pending).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(authFailure).not.toHaveBeenCalled();
  });
});
