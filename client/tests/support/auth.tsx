import { render } from "@testing-library/react";
import { vi } from "vitest";
import type { ReactNode } from "react";
import { AuthProvider } from "../../src/context/AuthContext.js";
import type { SafeUser } from "../../src/types/index.js";

export const TEST_REQUESTER: SafeUser = {
  id: 1,
  fullName: "Jennifer Anderson",
  email: "jennifer@kmutt.ac.th",
  active: true,
  role: "REQUESTER",
  mustChangePassword: false,
};

/**
 * Mounts a component at the same authenticated seam used by the application.
 * The only bootstrap response is /api/auth/me; page tests can continue to
 * mock their own feature API modules without reintroducing a requester
 * selector or local identity state.
 */
export function renderAuthenticated(
  ui: ReactNode,
  user: SafeUser = TEST_REQUESTER,
  csrfToken = "csrf-test"
)
{
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), "http://localhost").pathname;
    if (path === "/api/auth/me") {
      return new Response(JSON.stringify({ user, csrfToken }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(null, { status: 204 });
  });

  return { ...render(<AuthProvider>{ui}</AuthProvider>), fetchMock };
}
