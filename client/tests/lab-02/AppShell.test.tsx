import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "../../src/components/AppShell.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import { AppRoutes } from "../../src/AppRouter.js";
import * as referenceData from "../../src/api/referenceData.js";
import { getRequesterId } from "../../src/lib/http.js";
import type { DevRequester } from "../../src/types/index.js";

const REQUESTERS: DevRequester[] = [
  { id: 1, fullName: "Jennifer Anderson", email: "jennifer@kmutt.ac.th", department: "Engineering" },
  { id: 2, fullName: "Michael Brown", email: "michael@kmutt.ac.th", department: "Registrar" },
];

beforeEach(() => {
  window.localStorage.clear();
});

describe("Application shell", () => {
  it("UI-25: shows the selected requester's name", async () => {
    vi.spyOn(referenceData, "fetchDevRequesters").mockResolvedValue(REQUESTERS);
    window.localStorage.setItem("toktickit.requesterId", "1");

    render(
      <MemoryRouter initialEntries={["/tickets"]}>
        <RequesterProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/tickets" element={<p>Ticket list</p>} />
            </Route>
          </Routes>
        </RequesterProvider>
      </MemoryRouter>
    );

    expect(await screen.findByTestId("current-requester")).toHaveTextContent("Jennifer Anderson");
  });

  it("UI-25: Change Requester clears the selection and returns to the selector", async () => {
    vi.spyOn(referenceData, "fetchDevRequesters").mockResolvedValue(REQUESTERS);
    window.localStorage.setItem("toktickit.requesterId", "1");

    render(
      <MemoryRouter initialEntries={["/tickets"]}>
        <RequesterProvider>
          <AppRoutes />
        </RequesterProvider>
      </MemoryRouter>
    );

    await screen.findByTestId("current-requester");
    fireEvent.click(screen.getByRole("button", { name: /Change Requester/i }));

    // Landing back on the selector is what guarantees the previous requester's
    // data cannot still be on screen (BR-08).
    expect(await screen.findByRole("heading", { name: /Select Development Requester/i })).toBeInTheDocument();
    expect(screen.queryByTestId("current-requester")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("toktickit.requesterId")).toBeNull();
    expect(getRequesterId()).toBeNull();
  });
});

describe("Requester guard and persistence", () => {
  it("UI-18: redirects to the selector when no requester is selected", async () => {
    vi.spyOn(referenceData, "fetchDevRequesters").mockResolvedValue(REQUESTERS);

    render(
      <MemoryRouter initialEntries={["/tickets"]}>
        <RequesterProvider>
          <AppRoutes />
        </RequesterProvider>
      </MemoryRouter>
    );

    expect(
      await screen.findByRole("heading", { name: /Select Development Requester/i })
    ).toBeInTheDocument();
  });

  it("restores a stored selection, so a reload does not send the user back to the selector", async () => {
    vi.spyOn(referenceData, "fetchDevRequesters").mockResolvedValue(REQUESTERS);
    window.localStorage.setItem("toktickit.requesterId", "2");

    render(
      <MemoryRouter initialEntries={["/tickets"]}>
        <RequesterProvider>
          <AppRoutes />
        </RequesterProvider>
      </MemoryRouter>
    );

    expect(await screen.findByTestId("current-requester")).toHaveTextContent("Michael Brown");
    // The identity the API layer will send must match the restored selection.
    expect(getRequesterId()).toBe(2);
  });

  it("discards a stored selection that is no longer active", async () => {
    // Requester 9 is not in the active list the server returns, so it must not
    // stay selected across sessions (BR-07).
    vi.spyOn(referenceData, "fetchDevRequesters").mockResolvedValue(REQUESTERS);
    window.localStorage.setItem("toktickit.requesterId", "9");

    render(
      <MemoryRouter initialEntries={["/tickets"]}>
        <RequesterProvider>
          <AppRoutes />
        </RequesterProvider>
      </MemoryRouter>
    );

    expect(
      await screen.findByRole("heading", { name: /Select Development Requester/i })
    ).toBeInTheDocument();
    expect(window.localStorage.getItem("toktickit.requesterId")).toBeNull();
  });
});
