import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import { SelectRequesterPage } from "../../src/pages/SelectRequesterPage.js";
// Spied on directly rather than through a barrel: vi.spyOn cannot redefine an
// ESM re-exported binding, so re-exporting these through src/api.ts would
// break both this test and the Lab 1 test.
import * as referenceData from "../../src/api/referenceData.js";
import type { DevRequester } from "../../src/types/index.js";

const ACTIVE: DevRequester[] = [
  { id: 1, fullName: "Jennifer Anderson", email: "jennifer@kmutt.ac.th", department: "Engineering" },
  { id: 2, fullName: "Michael Brown", email: "michael@kmutt.ac.th", department: "Registrar" },
  { id: 3, fullName: "Sarah Johnson", email: "sarah@kmutt.ac.th", department: "Science" },
  { id: 4, fullName: "David Lee", email: "david@kmutt.ac.th", department: "Library" },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/select-requester"]}>
      <RequesterProvider>
        <Routes>
          <Route path="/select-requester" element={<SelectRequesterPage />} />
          <Route path="/tickets" element={<h1>My Tickets</h1>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("Development Requester Selection", () => {
  it("UI-01: lists the active requesters returned by the server", async () => {
    vi.spyOn(referenceData, "fetchDevRequesters").mockResolvedValue(ACTIVE);

    renderPage();

    expect(await screen.findByRole("option", { name: /Jennifer Anderson/ })).toBeInTheDocument();
    for (const requester of ACTIVE) {
      expect(screen.getByRole("option", { name: new RegExp(requester.fullName) })).toBeInTheDocument();
    }
  });

  it("UI-01: shows no requester the server did not return", async () => {
    // The server excludes inactive requesters, so the screen simply renders
    // what it is given — the exclusion is not re-implemented in the client,
    // where it could be bypassed (BR-06).
    vi.spyOn(referenceData, "fetchDevRequesters").mockResolvedValue(ACTIVE);

    renderPage();

    await screen.findByRole("option", { name: /Jennifer Anderson/ });
    expect(screen.queryByRole("option", { name: /Somsri Inactive/ })).not.toBeInTheDocument();
  });

  it("states that this is not a login screen", async () => {
    vi.spyOn(referenceData, "fetchDevRequesters").mockResolvedValue(ACTIVE);

    renderPage();

    expect(await screen.findByText(/not a login screen/i)).toBeInTheDocument();
    expect(screen.getByText(/Authentication coming in Lab 3/i)).toBeInTheDocument();
  });

  it("keeps Continue disabled until a requester is chosen", async () => {
    vi.spyOn(referenceData, "fetchDevRequesters").mockResolvedValue(ACTIVE);

    renderPage();

    const button = await screen.findByRole("button", { name: /Continue/i });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Development Requester/i), { target: { value: "2" } });
    expect(button).toBeEnabled();
  });

  it("selects the requester and moves on to My Tickets", async () => {
    vi.spyOn(referenceData, "fetchDevRequesters").mockResolvedValue(ACTIVE);

    renderPage();

    fireEvent.change(await screen.findByLabelText(/Development Requester/i), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    expect(await screen.findByRole("heading", { name: "My Tickets" })).toBeInTheDocument();
  });

  it("UI-02: shows an empty state when no active requesters exist", async () => {
    vi.spyOn(referenceData, "fetchDevRequesters").mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText(/No active development requesters found/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Continue/i })).not.toBeInTheDocument();
  });

  it("UI-02: shows a safe failure state with a retry action", async () => {
    const spy = vi
      .spyOn(referenceData, "fetchDevRequesters")
      .mockRejectedValue(new Error("Network down"));

    renderPage();

    expect(await screen.findByText(/Could not load development requesters/i)).toBeInTheDocument();
    // The internal error text must not reach the requester (BR-27).
    expect(screen.queryByText(/Network down/)).not.toBeInTheDocument();

    spy.mockResolvedValue(ACTIVE);
    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));

    expect(await screen.findByRole("option", { name: /Jennifer Anderson/ })).toBeInTheDocument();
  });

  it("shows a loading state while the request is in flight", async () => {
    let resolve: (value: DevRequester[]) => void = () => {};
    vi.spyOn(referenceData, "fetchDevRequesters").mockReturnValue(
      new Promise<DevRequester[]>((r) => {
        resolve = r;
      })
    );

    renderPage();

    expect(screen.getByText(/Loading development requesters/i)).toBeInTheDocument();

    resolve(ACTIVE);
    await waitFor(() => expect(screen.queryByText(/Loading development requesters/i)).not.toBeInTheDocument());
  });

  it("marks the required field with an asterisk that does not replace the label", async () => {
    vi.spyOn(referenceData, "fetchDevRequesters").mockResolvedValue(ACTIVE);

    renderPage();

    await screen.findByLabelText(/Development Requester/i);
    // The asterisk is decorative; the accessible name carries "(required)".
    expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("(required)")).toBeInTheDocument();
  });
});
