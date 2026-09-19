import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StaffTicketDetailPage } from "../../src/pages/StaffTicketDetailPage.js";
import * as ticketsApi from "../../src/api/tickets.js";
import * as attachmentApi from "../../src/api/attachments.js";
import { ApiError } from "../../src/lib/http.js";
import type { TicketDetail } from "../../src/types/index.js";

const OWNER = { id: 10, fullName: "Alex Staff", role: "STAFF" as const };
const ADMIN = { id: 11, fullName: "Ada Admin", role: "ADMIN" as const };
const COMMENT = {
  id: 1,
  body: "Requester can see this update.",
  createdAt: "2026-09-02T10:00:00.000Z",
  author: { id: 2, fullName: "Requester One", role: "REQUESTER" as const },
};
const NOTE = {
  id: 2,
  body: "Staff-only triage note.",
  createdAt: "2026-09-02T11:00:00.000Z",
  author: { id: 10, fullName: "Alex Staff", role: "STAFF" as const },
};

const DETAIL: TicketDetail = {
  id: 42,
  ticketNumber: "TKT-2026-000042",
  summary: "VPN access is unavailable",
  description: "The requester cannot connect to the corporate VPN.",
  requestedPriority: "HIGH",
  itPriority: "MEDIUM",
  currentStatus: "OPEN",
  createdAt: "2026-09-01T09:14:00.000Z",
  updatedAt: "2026-09-02T10:00:00.000Z",
  category: { id: 2, name: "Network" },
  relatedSystem: { id: 8, name: "VPN" },
  requester: { id: 2, fullName: "Requester One", email: "requester@example.com" },
  owner: OWNER,
  attachments: [
    {
      id: 9,
      originalFilename: "vpn-log.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      uploadedAt: "2026-09-01T09:20:00.000Z",
      isRemoved: false,
      removedAt: null,
      removalReason: null,
    },
    {
      id: 10,
      originalFilename: "old-log.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      uploadedAt: "2026-09-01T09:21:00.000Z",
      isRemoved: true,
      removedAt: "2026-09-02T09:21:00.000Z",
      removalReason: "Duplicate file",
    },
  ],
  publicComments: [COMMENT],
  internalNotes: [NOTE],
  resolutionIndication: null,
  allowedTransitions: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "CANCELLED"],
};

function renderDetail(responses: TicketDetail[] = [DETAIL]) {
  const fetch = vi.spyOn(ticketsApi, "fetchStaffTicket");
  responses.forEach((response) => fetch.mockResolvedValueOnce(response));
  const rendered = render(
    <MemoryRouter initialEntries={[`/staff/tickets/${DETAIL.id}`]}>
      <Routes>
        <Route path="/staff/tickets/:id" element={<StaffTicketDetailPage />} />
        <Route path="/staff/tickets" element={<h1>Staff Queue</h1>} />
      </Routes>
    </MemoryRouter>
  );
  return { ...rendered, fetch };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(ticketsApi, "fetchTicketOwners").mockResolvedValue([OWNER, ADMIN]);
  vi.spyOn(attachmentApi, "downloadAttachment").mockResolvedValue(undefined);
});

describe("Issue #58 Staff Ticket Detail", () => {
  it("renders read-only ticket data, distinct communications, literal markup, indication and attachment states", async () => {
    renderDetail([{ ...DETAIL, publicComments: [{ ...COMMENT, body: "<img src=x onerror=alert(1)>" }], internalNotes: [{ ...NOTE, body: "<script>alert(1)</script>" }] }]);

    expect(await screen.findByRole("heading", { name: DETAIL.ticketNumber })).toBeInTheDocument();
    expect(screen.getByText("requester@example.com")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Public Comments" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Internal Notes/ })).toBeInTheDocument();
    expect(screen.getByText("Visible to Requester and staff")).toBeInTheDocument();
    expect(screen.getByText("Visible only to IT Staff and Administrators")).toBeInTheDocument();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(document.querySelector("img")).not.toBeInTheDocument();
    expect(document.querySelector("script")).not.toBeInTheDocument();
    expect(screen.getByText("vpn-log.pdf")).toBeInTheDocument();
    expect(screen.getByText("old-log.pdf")).toBeInTheDocument();
    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add attachment" })).not.toBeInTheDocument();
  });

  it("claims an unassigned ticket with independent busy/success feedback", async () => {
    const user = userEvent.setup();
    const detail = { ...DETAIL, owner: null };
    renderDetail([detail, { ...detail, owner: OWNER }]);
    const claim = vi.spyOn(ticketsApi, "claimStaffTicket").mockResolvedValue({ owner: OWNER });

    await user.click(await screen.findByRole("button", { name: "Claim Ticket" }));
    expect(claim).toHaveBeenCalledWith(DETAIL.id);
    expect(await screen.findByText("Ticket claimed successfully. Refreshing owner details.")).toBeInTheDocument();
  });

  it("loads the safe owner directory and captures the displayed expectedOwnerId for Reassign", async () => {
    const user = userEvent.setup();
    const owners = vi.spyOn(ticketsApi, "fetchTicketOwners").mockResolvedValue([OWNER, ADMIN]);
    const reassign = vi.spyOn(ticketsApi, "reassignStaffTicket").mockResolvedValue({ owner: ADMIN });
    renderDetail([DETAIL, { ...DETAIL, owner: ADMIN }]);

    await user.click(await screen.findByRole("button", { name: "Reassign Ticket" }));
    expect(await screen.findByRole("option", { name: "Ada Admin — Administrator" })).toBeInTheDocument();
    expect(owners).toHaveBeenCalledTimes(1);
    await user.selectOptions(screen.getByLabelText("New eligible Owner"), String(ADMIN.id));
    await user.click(screen.getByRole("button", { name: "Confirm Reassign" }));
    expect(reassign).toHaveBeenCalledWith(DETAIL.id, ADMIN.id, OWNER.id);
    expect(await screen.findByText("Owner changed successfully. Refreshing Ticket detail.")).toBeInTheDocument();
  });

  it("handles stale Reassign by refreshing and requiring an explicit retry", async () => {
    const user = userEvent.setup();
    const refreshed = { ...DETAIL, owner: ADMIN };
    renderDetail([DETAIL, refreshed]);
    vi.spyOn(ticketsApi, "reassignStaffTicket").mockRejectedValue(new ApiError(409, "TICKET_OWNER_CHANGED", "changed", []));

    await user.click(await screen.findByRole("button", { name: "Reassign Ticket" }));
    await user.selectOptions(await screen.findByLabelText("New eligible Owner"), String(ADMIN.id));
    await user.click(screen.getByRole("button", { name: "Confirm Reassign" }));
    expect(await screen.findByText(/ownership changed.*explicitly retry/i)).toBeInTheDocument();
    expect((await screen.findAllByText("Ada Admin")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Reassign Ticket" })).toBeInTheDocument();
  });

  it("keeps owner-directory forbidden and retry feedback separate from the detail", async () => {
    const user = userEvent.setup();
    const owners = vi.spyOn(ticketsApi, "fetchTicketOwners")
      .mockRejectedValueOnce(new ApiError(403, "FORBIDDEN", "Forbidden"))
      .mockResolvedValueOnce([ADMIN]);
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "Reassign Ticket" }));
    expect(await screen.findByText("Eligible Owner choices are unavailable for this account.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Reassign Ticket" }));
    expect(await screen.findByRole("option", { name: "Ada Admin — Administrator" })).toBeInTheDocument();
    expect(owners).toHaveBeenCalledTimes(2);
  });

  it("saves IT Priority independently and keeps Requested Priority read-only", async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(ticketsApi, "updateStaffItPriority").mockResolvedValue({ itPriority: "URGENT" });
    renderDetail();
    await user.selectOptions(await screen.findByRole("combobox", { name: "IT Priority" }), "URGENT");
    await user.click(screen.getByRole("button", { name: "Save IT Priority" }));
    expect(save).toHaveBeenCalledWith(DETAIL.id, "URGENT");
    expect(await screen.findByText("IT Priority saved.")).toBeInTheDocument();
    expect(screen.getByTestId("requested-priority")).toHaveTextContent("High");
  });

  it("requires confirmation for significant transitions and explains Closed finality", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(ticketsApi, "updateStaffTicketStatus").mockResolvedValue({ currentStatus: "CLOSED", resolutionIndication: null, allowedTransitions: [] });
    renderDetail([{ ...DETAIL, allowedTransitions: ["CLOSED"] }, { ...DETAIL, currentStatus: "CLOSED", allowedTransitions: [] }]);
    await user.selectOptions(await screen.findByLabelText("Next status"), "CLOSED");
    await user.click(screen.getByRole("button", { name: "Update status" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Closing this Ticket is final");
    expect(update).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm Closed" }));
    expect(update).toHaveBeenCalledWith(DETAIL.id, "CLOSED", undefined);
  });

  it("requires a Public Comment for Waiting for Requester and submits it with the status mutation", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(ticketsApi, "updateStaffTicketStatus")
      .mockRejectedValueOnce(new ApiError(400, "VALIDATION_FAILED", "invalid"))
      .mockResolvedValueOnce({ currentStatus: "WAITING_FOR_REQUESTER", resolutionIndication: null, allowedTransitions: ["OPEN"] });
    renderDetail([{ ...DETAIL, allowedTransitions: ["WAITING_FOR_REQUESTER"] }]);
    await user.selectOptions(await screen.findByLabelText("Next status"), "WAITING_FOR_REQUESTER");
    await user.click(screen.getByRole("button", { name: "Update status" }));
    expect(await screen.findByText(/Enter a Public Comment when waiting/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Public Comment for Requester/), "Please test again.");
    await user.click(screen.getByRole("button", { name: "Update status" }));
    expect(update).toHaveBeenCalledWith(DETAIL.id, "WAITING_FOR_REQUESTER", "Please test again.");
  });

  it.each([
    ["RESOLVED", "Confirm Resolved"],
    ["CANCELLED", "Confirm Cancelled"],
    ["REOPENED", "Confirm Reopened"],
  ] as const)("requires explicit confirmation before %s", async (status, confirmationLabel) => {
    const user = userEvent.setup();
    const update = vi.spyOn(ticketsApi, "updateStaffTicketStatus").mockResolvedValue({
      currentStatus: status,
      resolutionIndication: null,
      allowedTransitions: [],
    });
    renderDetail([{ ...DETAIL, allowedTransitions: [status] }, { ...DETAIL, currentStatus: status, allowedTransitions: [] }]);
    await user.selectOptions(await screen.findByRole("combobox", { name: "Next status" }), status);
    await user.click(screen.getByRole("button", { name: "Update status" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: confirmationLabel }));
    expect(update).toHaveBeenCalledWith(DETAIL.id, status, undefined);
  });

  it("keeps Public Comments and Internal Notes available while a Ticket is Resolved", async () => {
    const user = userEvent.setup();
    const publicPost = vi.spyOn(ticketsApi, "postStaffPublicComment").mockResolvedValue({ ...COMMENT, id: 21, body: "Resolved follow-up" });
    const notePost = vi.spyOn(ticketsApi, "postInternalNote").mockResolvedValue({ ...NOTE, id: 22, body: "Resolved triage note" });
    renderDetail([{ ...DETAIL, currentStatus: "RESOLVED", allowedTransitions: ["CLOSED", "REOPENED"] }]);
    await user.type(await screen.findByLabelText("Add Public Comment"), "Resolved follow-up");
    await user.click(screen.getByRole("button", { name: "Post Public Comment" }));
    await user.type(screen.getByLabelText("Add Internal Note"), "Resolved triage note");
    await user.click(screen.getByRole("button", { name: "Save Internal Note" }));
    expect(publicPost).toHaveBeenCalledWith(DETAIL.id, "Resolved follow-up");
    expect(notePost).toHaveBeenCalledWith(DETAIL.id, "Resolved triage note");
    expect(await screen.findByText("Resolved follow-up")).toBeInTheDocument();
    expect(await screen.findByText("Resolved triage note")).toBeInTheDocument();
  });

  it("uses server Final feedback even when a Public Comment draft fails local validation", async () => {
    const user = userEvent.setup();
    const finalTicket = { ...DETAIL, currentStatus: "CANCELLED" as const, allowedTransitions: [] };
    const publicPost = vi.spyOn(ticketsApi, "postStaffPublicComment")
      .mockRejectedValue(new ApiError(409, "TICKET_FINAL", "final"));
    const { fetch } = renderDetail([DETAIL, finalTicket]);
    const composer = await screen.findByLabelText("Add Public Comment");
    fireEvent.change(composer, { target: { value: "x".repeat(2001) } });
    await user.click(screen.getByRole("button", { name: "Post Public Comment" }));
    expect(publicPost).toHaveBeenCalledWith(DETAIL.id, "x".repeat(2001));
    expect(await screen.findByTestId("terminal-readonly")).toHaveTextContent("read-only");
    expect(await screen.findByText(/now Closed\/Cancelled.*read-only detail/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("traps focus in Reassign dialog, closes on Escape, and restores focus to its trigger", async () => {
    const user = userEvent.setup();
    renderDetail();
    const trigger = await screen.findByRole("button", { name: "Reassign Ticket" });
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Reassign Ticket" });
    const ownerSelect = await screen.findByRole("combobox", { name: "New eligible Owner" });
    expect(ownerSelect).toHaveFocus();
    const confirm = screen.getByRole("button", { name: "Confirm Reassign" });
    confirm.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(ownerSelect).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Reassign Ticket" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("keeps the responsive page bounded without an overflow strip", async () => {
    renderDetail();
    const page = (await screen.findByRole("heading", { name: DETAIL.ticketNumber })).closest(".staff-ticket-detail");
    expect(page).toHaveClass("staff-ticket-detail");
    expect(page).not.toHaveClass("overflow-x-auto");
    expect(page).toHaveStyle({ overflowX: "clip" });
    expect(page?.querySelector(".staff-communication-public")).toBeInTheDocument();
    expect(page?.querySelector(".staff-communication-internal")).toBeInTheDocument();
  });

  it("posts Public Comments and Internal Notes through separate forms and clears each draft", async () => {
    const user = userEvent.setup();
    const publicPost = vi.spyOn(ticketsApi, "postStaffPublicComment").mockResolvedValue({ ...COMMENT, id: 8, body: "Public reply" });
    const notePost = vi.spyOn(ticketsApi, "postInternalNote").mockResolvedValue({ ...NOTE, id: 9, body: "Private note" });
    renderDetail();
    const publicComposer = await screen.findByLabelText("Add Public Comment");
    const noteComposer = await screen.findByLabelText("Add Internal Note");
    const publicForm = publicComposer.closest("form")!;
    const noteForm = noteComposer.closest("form")!;
    await user.type(publicComposer, "Public reply");
    await user.click(within(publicForm).getByRole("button", { name: "Post Public Comment" }));
    await user.type(noteComposer, "Private note");
    await user.click(within(noteForm).getByRole("button", { name: "Save Internal Note" }));
    expect(publicPost).toHaveBeenCalledWith(DETAIL.id, "Public reply");
    expect(notePost).toHaveBeenCalledWith(DETAIL.id, "Private note");
    expect(await screen.findByText("Public reply")).toBeInTheDocument();
    expect(await screen.findByText("Private note")).toBeInTheDocument();
    expect(screen.getByLabelText("Add Public Comment")).toHaveValue("");
    expect(screen.getByLabelText("Add Internal Note")).toHaveValue("");
  });

  it("shows indication context and downloads active attachments without staff upload/remove controls", async () => {
    const user = userEvent.setup();
    const indication = { indicatedAt: "2026-09-03T10:00:00.000Z", indicatedBy: { id: 2, fullName: "Requester One", role: "REQUESTER" as const } };
    const download = vi.spyOn(attachmentApi, "downloadAttachment");
    renderDetail([{ ...DETAIL, resolutionIndication: indication }]);
    expect(await screen.findByText(/Indicated by Requester One/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Download" }));
    expect(download).toHaveBeenCalledWith(DETAIL.attachments[0]);
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("makes final Tickets read-only while retaining history and attachment download", async () => {
    const finalTicket = { ...DETAIL, currentStatus: "CLOSED" as const, allowedTransitions: [] };
    renderDetail([finalTicket]);
    expect(await screen.findByTestId("terminal-readonly")).toHaveTextContent("read-only");
    expect(screen.queryByRole("button", { name: "Claim Ticket" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reassign Ticket" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save IT Priority" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add Public Comment")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add Internal Note")).not.toBeInTheDocument();
    expect(screen.getByText("Requester can see this update.")).toBeInTheDocument();
    expect(screen.getByText("Staff-only triage note.")).toBeInTheDocument();
  });

  it("lets a returned TICKET_FINAL override local action feedback and refreshes the detail", async () => {
    const user = userEvent.setup();
    const finalTicket = { ...DETAIL, currentStatus: "CLOSED" as const, allowedTransitions: [] };
    vi.spyOn(ticketsApi, "updateStaffItPriority").mockRejectedValue(new ApiError(409, "TICKET_FINAL", "final"));
    renderDetail([DETAIL, finalTicket]);
    await user.click(await screen.findByRole("button", { name: "Save IT Priority" }));
    expect(await screen.findByText(/now Closed\/Cancelled.*read-only detail/i)).toBeInTheDocument();
    expect(await screen.findByTestId("terminal-readonly")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save IT Priority" })).not.toBeInTheDocument();
  });

  it("renders safe failure feedback without exposing API codes and keeps unrelated actions available", async () => {
    const user = userEvent.setup();
    vi.spyOn(ticketsApi, "postStaffPublicComment").mockRejectedValue(new ApiError(500, "INTERNAL_ERROR", "internal details"));
    renderDetail();
    await user.type(await screen.findByLabelText("Add Public Comment"), "retry me");
    await user.click(screen.getByRole("button", { name: "Post Public Comment" }));
    expect(await screen.findByText(/Public Comment could not be posted/i)).toBeInTheDocument();
    expect(screen.queryByText("INTERNAL_ERROR")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save IT Priority" })).toBeEnabled();
  });

  it("uses responsive detail classes and accessible labelled controls", async () => {
    renderDetail();
    const page = await screen.findByRole("heading", { name: DETAIL.ticketNumber });
    expect(page.closest(".staff-ticket-detail")).toHaveClass("staff-ticket-detail");
    expect(screen.getByRole("combobox", { name: "IT Priority" })).toHaveAccessibleName("IT Priority");
    expect(screen.getByRole("combobox", { name: "Next status" })).toHaveAccessibleName("Next status");
    expect(screen.getByRole("textbox", { name: "Add Public Comment" })).toHaveAccessibleName("Add Public Comment");
    expect(screen.getByRole("textbox", { name: "Add Internal Note" })).toHaveAccessibleName("Add Internal Note");
  });
});
