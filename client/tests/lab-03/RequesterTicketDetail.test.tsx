import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RequesterTicketDetailPage } from "../../src/pages/RequesterTicketDetailPage.js";
import * as ticketsApi from "../../src/api/tickets.js";
import { ApiError } from "../../src/lib/http.js";
import type { TicketDetail } from "../../src/types/index.js";

const COMMENT = {
  id: 2,
  body: "The issue is still happening.",
  createdAt: "2026-09-02T10:00:00.000Z",
  author: { id: 1, fullName: "Jennifer Anderson", role: "REQUESTER" as const },
};

const INDICATION = {
  indicatedAt: "2026-09-03T10:00:00.000Z",
  indicatedBy: { id: 1, fullName: "Jennifer Anderson", role: "REQUESTER" as const },
};

const TICKET: TicketDetail = {
  id: 42,
  ticketNumber: "TKT-2026-000042",
  summary: "Laptop battery drains quickly",
  description: "The battery drains much faster than usual even when the system is idle.",
  requestedPriority: "HIGH",
  itPriority: "MEDIUM",
  currentStatus: "OPEN",
  createdAt: "2026-09-01T09:14:00.000Z",
  updatedAt: "2026-09-02T10:00:00.000Z",
  category: { id: 2, name: "Hardware" },
  relatedSystem: { id: 8, name: "Corporate Laptop" },
  requester: { id: 1, fullName: "Jennifer Anderson", email: "jennifer@kmutt.ac.th" },
  attachments: [],
  publicComments: [
    { ...COMMENT, id: 1, body: "First update", createdAt: "2026-09-01T10:00:00.000Z" },
    COMMENT,
  ],
  resolutionIndication: null,
};

function renderDetail(ticket: TicketDetail = TICKET, fetchResponses?: TicketDetail[]) {
  const fetch = vi.spyOn(ticketsApi, "fetchTicket");
  if (fetchResponses) {
    fetchResponses.forEach((response) => fetch.mockResolvedValueOnce(response));
  } else {
    fetch.mockResolvedValue(ticket);
  }
  const rendered = render(
      <MemoryRouter initialEntries={[`/tickets/${ticket.id}`]}>
      <Routes>
        <Route path="/tickets/:id" element={<RequesterTicketDetailPage />} />
        <Route path="/tickets" element={<h1>My Tickets</h1>} />
      </Routes>
    </MemoryRouter>
  );
  return { ...rendered, fetch };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("Issue #54 requester ticket detail", () => {
  it("renders distinct priorities and chronological public comments as literal text", async () => {
    renderDetail();

    expect(await screen.findByRole("heading", { name: TICKET.ticketNumber })).toBeInTheDocument();
    expect(screen.getByText("Requested Priority")).toBeInTheDocument();
    expect(screen.getByText("IT Priority")).toBeInTheDocument();
    expect(screen.getByTestId("requested-priority")).toHaveTextContent("High");
    expect(screen.getByTestId("it-priority")).toHaveTextContent("Medium");

    const bodies = screen.getAllByRole("paragraph").filter((node) => /First update|still happening/.test(node.textContent ?? ""));
    expect(bodies.map((node) => node.textContent)).toEqual(["First update", "The issue is still happening."]);

  });

  it("renders malicious comment markup literally without creating an element", async () => {
    cleanup();
    const malicious = "<img src=x onerror=alert(1)>";
    renderDetail({ ...TICKET, publicComments: [{ ...COMMENT, body: malicious }] });

    expect(await screen.findByText(malicious)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("validates blank and over-limit comments without calling the API", async () => {
    const post = vi.spyOn(ticketsApi, "postPublicComment");
    renderDetail();
    const composer = await screen.findByLabelText("Add a public comment");

    fireEvent.submit(composer.closest("form")!);
    expect(await screen.findByText(/Enter a public comment/i)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    fireEvent.change(composer, { target: { value: "x".repeat(2001) } });
    fireEvent.submit(composer.closest("form")!);
    expect(await screen.findByText(/2,000 characters or fewer/i)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("posts once, shows busy feedback, and appends the returned comment", async () => {
    let resolvePost: (value: typeof COMMENT) => void = () => undefined;
    const post = vi.spyOn(ticketsApi, "postPublicComment").mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      })
    );
    renderDetail();
    const composer = await screen.findByLabelText("Add a public comment");
    fireEvent.change(composer, { target: { value: "Please check the battery health." } });
    const form = composer.closest("form")!;

    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Posting/i })).toBeDisabled();

    resolvePost({ ...COMMENT, id: 3, body: "Please check the battery health." });
    expect(await screen.findByText("Your public comment was posted.")).toBeInTheDocument();
    expect(screen.getByText("Please check the battery health.")).toBeInTheDocument();
  });

  it("keeps the draft and gives retry feedback when posting fails", async () => {
    vi.spyOn(ticketsApi, "postPublicComment").mockRejectedValue(new Error("network down"));
    renderDetail();
    const composer = await screen.findByLabelText("Add a public comment");
    fireEvent.change(composer, { target: { value: "Retry this message" } });
    fireEvent.submit(composer.closest("form")!);

    expect(await screen.findByText(/could not be posted.*retry/i)).toBeInTheDocument();
    expect(composer).toHaveValue("Retry this message");
  });

  it("shows the indication only when eligible and records it without changing status", async () => {
    const indicate = vi.spyOn(ticketsApi, "indicateResolution").mockResolvedValue(INDICATION);
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Problem appears resolved" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(/does not close the Ticket or change its status/i);
    fireEvent.click(screen.getByRole("button", { name: "Confirm indication" }));

    await waitFor(() => expect(indicate).toHaveBeenCalledWith(42));
    expect(await screen.findByText(/has been recorded/i)).toBeInTheDocument();
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Open");
  });

  it("focuses, traps, and restores focus for the indication dialog", async () => {
    renderDetail();
    const trigger = await screen.findByRole("button", { name: "Problem appears resolved" });

    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Confirm indication" });
    expect(document.activeElement).toBe(cancel);

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Problem appears resolved" }));
  });

  it("renders a responsive, overflow-safe representation", async () => {
    renderDetail();

    const heading = await screen.findByRole("heading", { name: TICKET.ticketNumber });
    const page = heading.closest(".zen-ticket-detail");
    expect(page).toHaveClass("zen-ticket-detail");
    expect(page?.querySelector(".zen-comment-timeline")).toHaveClass("zen-comment-timeline");
    expect(page?.querySelector(".zen-comment-body")).toHaveClass("zen-comment-body");
    expect(page?.querySelector("table")).toBeNull();
  });

  it("shows an already-recorded indication without offering a duplicate action", async () => {
    renderDetail({ ...TICKET, resolutionIndication: INDICATION });

    expect(await screen.findByText(/has been recorded/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Problem appears resolved" })).not.toBeInTheDocument();
  });

  it("refreshes detail after an indication conflict", async () => {
    const refreshed = { ...TICKET, resolutionIndication: INDICATION };
    vi.spyOn(ticketsApi, "indicateResolution").mockRejectedValue(
      new ApiError(409, "RESOLUTION_ALREADY_INDICATED", "This Ticket already has an active Resolution Indication.")
    );
    const { fetch } = renderDetail(TICKET, [TICKET, refreshed]);

    fireEvent.click(await screen.findByRole("button", { name: "Problem appears resolved" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm indication" }));

    expect(await screen.findByText(/has been recorded/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps an indication API failure retryable", async () => {
    const indicate = vi
      .spyOn(ticketsApi, "indicateResolution")
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(INDICATION);
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Problem appears resolved" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm indication" }));
    expect(await screen.findByText(/could not be recorded.*retry/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Problem appears resolved" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm indication" }));
    expect(await screen.findByText(/has been recorded/i)).toBeInTheDocument();
    expect(indicate).toHaveBeenCalledTimes(2);
  });

  it("prevents duplicate resolution indication submissions while busy", async () => {
    let resolveIndication: (value: typeof INDICATION) => void = () => undefined;
    const indicate = vi.spyOn(ticketsApi, "indicateResolution").mockReturnValue(
      new Promise((resolve) => {
        resolveIndication = resolve;
      })
    );
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Problem appears resolved" }));
    const confirm = screen.getByRole("button", { name: "Confirm indication" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(indicate).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();

    resolveIndication(INDICATION);
    expect(await screen.findByText(/has been recorded/i)).toBeInTheDocument();
  });

  it("keeps comments available on Resolved but hides the indication action", async () => {
    renderDetail({ ...TICKET, currentStatus: "RESOLVED" });

    expect(await screen.findByLabelText("Add a public comment")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Problem appears resolved" })).not.toBeInTheDocument();
    expect(screen.getByText(/already formally Resolved/i)).toBeInTheDocument();
  });

  it("makes Closed/Cancelled tickets read-only while retaining history and downloads", async () => {
    const finalTicket: TicketDetail = {
      ...TICKET,
      currentStatus: "CLOSED",
      attachments: [{
        id: 7,
        originalFilename: "evidence.png",
        mimeType: "image/png",
        sizeBytes: 1024,
        uploadedAt: "2026-09-01T10:00:00.000Z",
        isRemoved: false,
        removedAt: null,
        removalReason: null,
      }],
    };
    renderDetail(finalTicket);

    expect((await screen.findAllByText(/Closed\/Cancelled tickets are read-only/i)).length).toBeGreaterThan(0);
    expect(screen.getByText("First update")).toBeInTheDocument();
    expect(screen.queryByLabelText("Add a public comment")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Problem appears resolved" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add attachment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
  });

  it("never renders or requests restricted internal communication", async () => {
    const comments = vi.spyOn(ticketsApi, "fetchPublicComments");
    renderDetail();

    await screen.findByRole("heading", { name: TICKET.ticketNumber });
    expect(screen.queryByText(/Internal Notes/i)).not.toBeInTheDocument();
    expect(comments).not.toHaveBeenCalled();
  });

  it("refreshes after a terminal API response instead of showing local validation as success", async () => {
    const post = vi.spyOn(ticketsApi, "postPublicComment").mockRejectedValue(
      new ApiError(409, "TICKET_FINAL", "Closed or Cancelled Tickets are read-only.")
    );
    renderDetail();
    const composer = await screen.findByLabelText("Add a public comment");
    fireEvent.change(composer, { target: { value: "A valid comment" } });
    fireEvent.submit(composer.closest("form")!);

    expect(await screen.findByText(/now closed or cancelled/i)).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
  });
});
