import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequesterTicketDetailPage } from "../../src/pages/RequesterTicketDetailPage.js";
import * as ticketsApi from "../../src/api/tickets.js";
import * as referenceData from "../../src/api/referenceData.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import { AppRoutes } from "../../src/AppRouter.js";
import { ApiError } from "../../src/lib/http.js";
import type { TicketDetail } from "../../src/types/index.js";

const TICKET: TicketDetail = {
  id: 42,
  ticketNumber: "TKT-2026-000042",
  summary: "Laptop battery drains quickly",
  description: "The battery drains much faster than usual even when the system is idle.",
  requestedPriority: "HIGH",
  currentStatus: "NEW",
  createdAt: "2026-09-01T09:14:00.000Z",
  updatedAt: "2026-09-01T09:14:00.000Z",
  category: { id: 2, name: "Hardware" },
  relatedSystem: { id: 8, name: "Corporate Laptop" },
  requester: {
    id: 1,
    fullName: "Jennifer Anderson",
    email: "jennifer@kmutt.ac.th",
    department: "Engineering",
  },
  attachments: [],
};

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/tickets/42"]}>
      <Routes>
        <Route path="/tickets/:id" element={<RequesterTicketDetailPage />} />
        <Route path="/tickets" element={<h1>My Tickets</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("Ticket Detail — content", () => {
  it("UI-16: shows every specified ticket field", async () => {
    vi.spyOn(ticketsApi, "fetchTicket").mockResolvedValue(TICKET);

    renderDetail();

    expect(await screen.findByRole("heading", { name: "TKT-2026-000042" })).toBeInTheDocument();
    expect(screen.getByText("Hardware")).toBeInTheDocument();
    expect(screen.getByText("Corporate Laptop")).toBeInTheDocument();
    expect(screen.getByText("Jennifer Anderson")).toBeInTheDocument();
    expect(screen.getByText("Laptop battery drains quickly")).toBeInTheDocument();
    expect(screen.getByText(/battery drains much faster/)).toBeInTheDocument();
    expect(screen.getByTestId("priority-badge")).toHaveTextContent("High");
    expect(screen.getByTestId("status-badge")).toHaveTextContent("New");
  });

  it("UI-16: presents the ticket read-only, with no editable control", async () => {
    vi.spyOn(ticketsApi, "fetchTicket").mockResolvedValue(TICKET);

    renderDetail();

    await screen.findByRole("heading", { name: "TKT-2026-000042" });
    // Nothing on this screen edits the ticket (BR-44). The only inputs that may
    // appear belong to the attachment flow, which is not open here.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    const summaryField = screen.getByText("Laptop battery drains quickly");
    expect(summaryField).toHaveClass("zen-readonly");
  });

  it("UI-17: shows none of the features that belong to later sprints", async () => {
    vi.spyOn(ticketsApi, "fetchTicket").mockResolvedValue(TICKET);

    renderDetail();

    await screen.findByRole("heading", { name: "TKT-2026-000042" });
    // Comments, internal notes, actions taken, IT priority, ticket owner and
    // any status control are all out of scope for Lab 2 (BR-45).
    expect(screen.queryByText(/Public Comments/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Internal Notes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Actions Taken/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/IT Priority/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ticket Owner/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Resolution Summary/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Resolve|Close|Reopen|Cancel ticket/i })).not
      .toBeInTheDocument();
  });

  it("offers a way back to the list", async () => {
    vi.spyOn(ticketsApi, "fetchTicket").mockResolvedValue(TICKET);

    renderDetail();

    expect(await screen.findByRole("link", { name: /Back to My Tickets/i })).toHaveAttribute(
      "href",
      "/tickets"
    );
  });
});

describe("Ticket Detail — access and failure", () => {
  it("reports a ticket that is not the requester's as not found", async () => {
    // The server answers 404 for both "no such ticket" and "not yours", and
    // this screen makes no attempt to tell them apart (BR-13).
    vi.spyOn(ticketsApi, "fetchTicket").mockRejectedValue(
      new ApiError(404, "TICKET_NOT_FOUND", "The requested ticket does not exist.")
    );

    renderDetail();

    expect(await screen.findByText(/Ticket not found/i)).toBeInTheDocument();
    expect(screen.getByText(/belongs to a different requester/i)).toBeInTheDocument();
  });

  it("shows a retryable failure state for any other error", async () => {
    const spy = vi
      .spyOn(ticketsApi, "fetchTicket")
      .mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:3000"));

    renderDetail();

    expect(await screen.findByText(/Could not load this ticket/i)).toBeInTheDocument();
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();

    spy.mockResolvedValue(TICKET);
    screen.getByRole("button", { name: /Retry/i }).click();

    expect(await screen.findByRole("heading", { name: "TKT-2026-000042" })).toBeInTheDocument();
  });

  it("UI-18: redirects to the selector when no requester is selected", async () => {
    vi.spyOn(referenceData, "fetchDevRequesters").mockResolvedValue([]);
    vi.spyOn(ticketsApi, "fetchTicket").mockResolvedValue(TICKET);

    render(
      <MemoryRouter initialEntries={["/tickets/42"]}>
        <RequesterProvider>
          <AppRoutes />
        </RequesterProvider>
      </MemoryRouter>
    );

    expect(
      await screen.findByRole("heading", { name: /Select Development Requester/i })
    ).toBeInTheDocument();
  });
});
