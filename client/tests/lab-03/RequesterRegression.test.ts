import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { request, setCsrfToken } from "../../src/lib/http.js";

function okJson(body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Issue #52 — authenticated Requester HTTP boundary", () => {
  beforeEach(() => {
    setCsrfToken("csrf-regression");
  });

  afterEach(() => {
    setCsrfToken(null);
    vi.restoreAllMocks();
  });

  it("API-R05: sends the session cookie and CSRF header for JSON mutations", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson());

    await request("/api/tickets", {
      method: "POST",
      body: JSON.stringify({ summary: "Authenticated ticket" }),
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(init?.credentials).toBe("include");
    expect(headers.get("X-CSRF-Token")).toBe("csrf-regression");
    expect(headers.get("X-Requester-Id")).toBeNull();
  });

  it("API-R06: sends CSRF with multipart upload without corrupting its boundary", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(okJson());
    const body = new FormData();
    body.append("file", new Blob(["bytes"], { type: "image/png" }), "evidence.png");

    await request("/api/tickets/42/attachments", { method: "POST", body });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(init?.credentials).toBe("include");
    expect(headers.get("X-CSRF-Token")).toBe("csrf-regression");
    expect(headers.get("Content-Type")).toBeNull();
  });
});
