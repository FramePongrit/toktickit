import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CreateTicketPage } from "../../src/pages/CreateTicketPage.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import * as referenceData from "../../src/api/referenceData.js";
import * as ticketsApi from "../../src/api/tickets.js";
import { ApiError } from "../../src/lib/http.js";
import type { DevRequester, TicketDetail } from "../../src/types/index.js";

const REQUESTER: DevRequester = {
  id: 1,
  fullName: "Jennifer Anderson",
  email: "jennifer@kmutt.ac.th",
  department: "Engineering",
};

const CATEGORIES = [
  { id: 1, name: "Account and Access" },
  { id: 2, name: "Hardware" },
];
const SYSTEMS = [
  { id: 1, name: "Email" },
  { id: 8, name: "Corporate Laptop" },
];

const CREATED: TicketDetail = {
  id: 42,
  ticketNumber: "TKT-2026-000042",
  summary: "Laptop battery drains quickly",
  description: "The battery drains much faster than usual even when the system is idle.",
  requestedPriority: "MEDIUM",
  currentStatus: "NEW",
  createdAt: "2026-09-04T09:14:00.000Z",
  updatedAt: "2026-09-04T09:14:00.000Z",
  category: CATEGORIES[1],
  relatedSystem: SYSTEMS[1],
  requester: REQUESTER,
  attachments: [],
};

function renderPage() {
  window.localStorage.setItem("toktickit.requesterId", "1");
  return render(
    <MemoryRouter initialEntries={["/tickets/new"]}>
      <RequesterProvider>
        <Routes>
          <Route path="/tickets/new" element={<CreateTicketPage />} />
          <Route path="/tickets" element={<h1>My Tickets</h1>} />
          <Route path="/tickets/:id" element={<h1>Ticket detail</h1>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>
  );
}

/** Fills every field with data that passes client-side validation. */
async function fillValidForm() {
  fireEvent.change(await screen.findByLabelText(/Category/i), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText(/Related System/i), { target: { value: "8" } });
  fireEvent.change(screen.getByLabelText(/Requested Priority/i), { target: { value: "MEDIUM" } });
  fireEvent.change(screen.getByLabelText(/Ticket Summary/i), {
    target: { value: "Laptop battery drains quickly" },
  });
  fireEvent.change(screen.getByLabelText(/Description/i), {
    target: { value: "The battery drains much faster than usual even when idle." },
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(referenceData, "fetchDevRequesters").mockResolvedValue([REQUESTER]);
  vi.spyOn(referenceData, "fetchCategories").mockResolvedValue(CATEGORIES);
  vi.spyOn(referenceData, "fetchRelatedSystems").mockResolvedValue(SYSTEMS);
});

describe("Create Ticket — initial state", () => {
  it("loads reference data from the server into the selects", async () => {
    renderPage();

    expect(await screen.findByRole("option", { name: "Hardware" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Corporate Laptop" })).toBeInTheDocument();
  });

  it("UI-09: shows system-generated values as read-only, populated from the selected requester", async () => {
    renderPage();

    const requesterField = await screen.findByTestId("readonly-requester");
    expect(requesterField).toHaveTextContent("Jennifer Anderson");
    expect(requesterField).toHaveClass("zen-readonly");

    const ticketNumberField = screen.getByTestId("readonly-ticket-number");
    expect(ticketNumberField).toHaveTextContent(/generated on submit/i);
    expect(ticketNumberField).toHaveClass("zen-readonly");
  });

  it("UI-08: marks every required field with an asterisk that does not replace its label", async () => {
    renderPage();

    await screen.findByLabelText(/Category/i);
    // Five required fields, each carrying a decorative asterisk plus an
    // accessible "(required)".
    expect(screen.getAllByText("*")).toHaveLength(5);
    expect(screen.getAllByText("(required)")).toHaveLength(5);
  });
});

describe("Create Ticket — validation", () => {
  it("UI-03: shows a message below Summary and sends no request when it is empty", async () => {
    const createSpy = vi.spyOn(ticketsApi, "createTicket");
    renderPage();

    await screen.findByLabelText(/Category/i);
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));

    expect(await screen.findByText("Summary is required.")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("UI-03: rejects a summary shorter than the minimum without calling the API", async () => {
    const createSpy = vi.spyOn(ticketsApi, "createTicket");
    renderPage();

    await fillValidForm();
    fireEvent.change(screen.getByLabelText(/Ticket Summary/i), { target: { value: "help" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));

    expect(await screen.findByText(/at least 5 characters/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("UI-07: wires each message to its field with aria-describedby and aria-invalid", async () => {
    renderPage();

    await screen.findByLabelText(/Category/i);
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));

    const summary = await screen.findByLabelText(/Ticket Summary/i);
    expect(summary).toHaveAttribute("aria-invalid", "true");

    const describedBy = summary.getAttribute("aria-describedby");
    expect(describedBy).toContain("summary-error");
    // The message is reachable from the field, not floating at the top of the
    // form on its own (BR-28).
    expect(document.getElementById("summary-error")).toHaveTextContent("Summary is required.");
  });

  it("clears a field's message once the value becomes valid and is resubmitted", async () => {
    vi.spyOn(ticketsApi, "createTicket").mockResolvedValue(CREATED);
    renderPage();

    await screen.findByLabelText(/Category/i);
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));
    expect(await screen.findByText("Summary is required.")).toBeInTheDocument();

    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));

    await waitFor(() => expect(screen.queryByText("Summary is required.")).not.toBeInTheDocument());
  });
});

describe("Create Ticket — submission", () => {
  it("UI-05: shows the ticket number returned by the server", async () => {
    vi.spyOn(ticketsApi, "createTicket").mockResolvedValue(CREATED);
    renderPage();

    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));

    const success = await screen.findByText(/TKT-2026-000042 created successfully/i);
    expect(success).toBeInTheDocument();
    // Success is conveyed by text, not colour alone (AC-48).
    expect(screen.getByRole("link", { name: /View ticket/i })).toBeInTheDocument();
  });

  it("sends exactly the values entered, trimmed", async () => {
    const createSpy = vi.spyOn(ticketsApi, "createTicket").mockResolvedValue(CREATED);
    renderPage();

    await fillValidForm();
    fireEvent.change(screen.getByLabelText(/Ticket Summary/i), {
      target: { value: "  Laptop battery drains quickly  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy).toHaveBeenCalledWith({
      categoryId: 2,
      relatedSystemId: 8,
      requestedPriority: "MEDIUM",
      summary: "Laptop battery drains quickly",
      description: "The battery drains much faster than usual even when idle.",
    });
  });

  it("UI-04: disables submit and shows a busy state while the request is in flight", async () => {
    let resolve: (value: TicketDetail) => void = () => {};
    const createSpy = vi.spyOn(ticketsApi, "createTicket").mockReturnValue(
      new Promise<TicketDetail>((r) => {
        resolve = r;
      })
    );
    renderPage();

    await fillValidForm();
    const submit = screen.getByRole("button", { name: /Submit Ticket/i });
    fireEvent.click(submit);

    const busy = await screen.findByRole("button", { name: /Submitting/i });
    expect(busy).toBeDisabled();

    // A second click while busy must not produce a second ticket (BR-25).
    fireEvent.click(busy);
    expect(createSpy).toHaveBeenCalledTimes(1);

    resolve(CREATED);
    await screen.findByText(/created successfully/i);
  });
});

describe("Create Ticket — failure handling", () => {
  it("UI-06: keeps every entered value when the API fails", async () => {
    vi.spyOn(ticketsApi, "createTicket").mockRejectedValue(new Error("Network down"));
    renderPage();

    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));

    expect(await screen.findByText(/could not be submitted/i)).toBeInTheDocument();
    // Nothing the requester typed is lost (BR-26).
    expect(screen.getByLabelText(/Ticket Summary/i)).toHaveValue("Laptop battery drains quickly");
    expect(screen.getByLabelText(/Category/i)).toHaveValue("2");
    expect(screen.getByLabelText(/Description/i)).toHaveValue(
      "The battery drains much faster than usual even when idle."
    );
  });

  it("UI-06: never shows the internal error text to the requester", async () => {
    vi.spyOn(ticketsApi, "createTicket").mockRejectedValue(
      new Error("ECONNREFUSED 127.0.0.1:3000")
    );
    renderPage();

    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));

    await screen.findByText(/could not be submitted/i);
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
  });

  it("re-enables submit after a failure so the requester can retry", async () => {
    const spy = vi
      .spyOn(ticketsApi, "createTicket")
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValueOnce(CREATED);
    renderPage();

    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));
    await screen.findByText(/could not be submitted/i);

    const submit = screen.getByRole("button", { name: /Submit Ticket/i });
    expect(submit).toBeEnabled();

    fireEvent.click(submit);
    expect(await screen.findByText(/created successfully/i)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("renders server field errors beside the fields they name", async () => {
    vi.spyOn(ticketsApi, "createTicket").mockRejectedValue(
      new ApiError(400, "VALIDATION_FAILED", "The submitted data is invalid.", [
        { field: "summary", message: "Summary must be at least 5 characters." },
        { field: "categoryId", message: "Select a valid category." },
      ])
    );
    renderPage();

    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /Submit Ticket/i }));

    expect(await screen.findByText("Summary must be at least 5 characters.")).toBeInTheDocument();
    expect(screen.getByText("Select a valid category.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Ticket Summary/i)).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a retryable failure state when the reference data cannot load", async () => {
    const spy = vi
      .spyOn(referenceData, "fetchCategories")
      .mockRejectedValue(new Error("Service unavailable"));
    renderPage();

    expect(await screen.findByText(/Could not load the form options/i)).toBeInTheDocument();

    spy.mockResolvedValue(CATEGORIES);
    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));

    expect(await screen.findByRole("option", { name: "Hardware" })).toBeInTheDocument();
  });
});
