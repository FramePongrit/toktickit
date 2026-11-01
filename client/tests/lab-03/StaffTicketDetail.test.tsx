import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { StaffTicketDetailPage } from "../../src/pages/StaffTicketDetailPage.js";
import * as ticketsApi from "../../src/api/tickets.js";
import * as attachmentApi from "../../src/api/attachments.js";
import * as actionsApi from "../../src/api/actions.js";
import { ApiError } from "../../src/lib/http.js";
import type { ResolutionGate, TicketDetail } from "../../src/types/index.js";
import type { ActionPage, TicketAction } from "../../src/api/actions.js";

const auth = vi.hoisted(() => ({ user: { id: 10, fullName: "Alex Staff", email: "alex@example.test", role: "STAFF", active: true, mustChangePassword: false } }));
vi.mock("../../src/context/AuthContext.js", () => ({
  useAuth: () => ({ user: auth.user }),
  roleLabel: (role: string) => role === "ADMIN" ? "Administrator" : role === "STAFF" ? "IT Staff" : "Requester",
}));

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
const EMPTY_GATE: ResolutionGate = {
  canResolve: false,
  reasons: ["NO_COMPLETED_ACTION"],
  completedCount: 0,
  unfinishedCount: 0,
  followUpCount: 0,
};

const DETAIL: TicketDetail = {
  id: 42,
  ticketNumber: "TKT-2026-000042",
  summary: "VPN access is unavailable",
  description: "The requester cannot connect to the corporate VPN.",
  requestedPriority: "HIGH",
  itPriority: "MEDIUM",
  currentStatus: "OPEN",
  version: 1,
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

function renderDetail(responses: TicketDetail[] = [DETAIL], withTicketSwitcher = false, loader?: (ticketId: number) => Promise<TicketDetail>) {
  const fetch = vi.spyOn(ticketsApi, "fetchStaffTicket");
  if (loader) fetch.mockImplementation(loader);
  else responses.forEach((response) => fetch.mockResolvedValueOnce(response));
  const rendered = render(
    <MemoryRouter initialEntries={[`/staff/tickets/${DETAIL.id}`]}>
      <Routes>
        <Route path="/staff/tickets/:id" element={withTicketSwitcher ? <><Link to="/staff/tickets/43">Open next Ticket</Link><Link to="/staff/tickets/42">Return to first Ticket</Link><StaffTicketDetailPage /></> : <StaffTicketDetailPage />} />
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
    const detail = { ...DETAIL, owner: null, allowedTransitions: [] };
    renderDetail([detail, { ...detail, owner: OWNER, allowedTransitions: ["IN_PROGRESS"] }]);
    const claim = vi.spyOn(ticketsApi, "claimStaffTicket").mockResolvedValue({ owner: OWNER, ticketVersion: 2 });

    await user.click(await screen.findByRole("button", { name: "Claim Ticket" }));
    expect(claim).toHaveBeenCalledWith(DETAIL.id, 1);
    expect(await screen.findByText("Ticket claimed successfully. Refreshing owner and transition details.")).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "In Progress" })).toBeInTheDocument();
  });

  it("loads the safe owner directory and captures the displayed expectedOwnerId for Reassign", async () => {
    const user = userEvent.setup();
    const inactiveOwner = { ...OWNER, id: 12, fullName: "Inactive Staff" };
    const owners = vi.spyOn(ticketsApi, "fetchTicketOwners").mockResolvedValue([OWNER, ADMIN]);
    const reassign = vi.spyOn(ticketsApi, "reassignStaffTicket").mockResolvedValue({ owner: ADMIN, ticketVersion: 2 });
    renderDetail([
      { ...DETAIL, owner: inactiveOwner, allowedTransitions: [] },
      { ...DETAIL, owner: ADMIN, allowedTransitions: ["IN_PROGRESS"] },
    ]);

    expect(await screen.findByRole("heading", { name: DETAIL.ticketNumber })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "In Progress" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Reassign Ticket" }));
    expect(await screen.findByRole("option", { name: "Ada Admin — Administrator" })).toBeInTheDocument();
    expect(owners).toHaveBeenCalledTimes(1);
    await user.selectOptions(screen.getByLabelText("New eligible Owner"), String(ADMIN.id));
    await user.click(screen.getByRole("button", { name: "Confirm Reassign" }));
    expect(reassign).toHaveBeenCalledWith(DETAIL.id, ADMIN.id, inactiveOwner.id, 1);
    expect(await screen.findByText("Owner changed successfully. Refreshing owner and transition details.")).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "In Progress" })).toBeInTheDocument();
  });

  it("handles stale Reassign by refreshing and requiring an explicit retry", async () => {
    const user = userEvent.setup();
    const refreshed = { ...DETAIL, owner: ADMIN };
    renderDetail([DETAIL, refreshed]);
    vi.spyOn(ticketsApi, "reassignStaffTicket").mockRejectedValue(new ApiError(409, "TICKET_OWNER_CHANGED", "changed", []));

    await user.click(await screen.findByRole("button", { name: "Reassign Ticket" }));
    await user.selectOptions(await screen.findByLabelText("New eligible Owner"), String(ADMIN.id));
    await user.click(screen.getByRole("button", { name: "Confirm Reassign" }));
    expect((await screen.findAllByText(/ownership changed.*reload and review/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("New eligible Owner")).toHaveValue(String(ADMIN.id));
    await user.click(screen.getByRole("button", { name: "Reload latest Ticket before retrying" }));
    expect((await screen.findAllByText("Ada Admin")).length).toBeGreaterThan(0);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
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
    const save = vi.spyOn(ticketsApi, "updateStaffItPriority").mockResolvedValue({ itPriority: "URGENT", ticketVersion: 2 });
    renderDetail();
    await user.selectOptions(await screen.findByRole("combobox", { name: "IT Priority" }), "URGENT");
    await user.click(screen.getByRole("button", { name: "Save IT Priority" }));
    expect(save).toHaveBeenCalledWith(DETAIL.id, "URGENT", 1);
    expect(await screen.findByText("IT Priority saved.")).toBeInTheDocument();
    expect(screen.getByTestId("requested-priority")).toHaveTextContent("High");
  });

  it("requires confirmation for significant transitions and explains Closed finality", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(ticketsApi, "updateStaffTicketStatus").mockResolvedValue({ currentStatus: "CLOSED", resolutionIndication: null, allowedTransitions: [], ticketVersion: 2, workCycle: 1, resolvedAt: null, resolutionGate: EMPTY_GATE });
    renderDetail([{ ...DETAIL, allowedTransitions: ["CLOSED"] }, { ...DETAIL, currentStatus: "CLOSED", allowedTransitions: [] }]);
    await user.selectOptions(await screen.findByLabelText("Next status"), "CLOSED");
    await user.click(screen.getByRole("button", { name: "Update status" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Closing this Ticket is final");
    expect(update).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm Closed" }));
    expect(update).toHaveBeenCalledWith(DETAIL.id, "CLOSED", 1, undefined, expect.any(String));
  });

  it("reuses the exact status idempotency key after an ambiguous server error", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(ticketsApi, "updateStaffTicketStatus")
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "unknown commit outcome"))
      .mockResolvedValueOnce({ currentStatus: "IN_PROGRESS", resolutionIndication: null, allowedTransitions: [], ticketVersion: 2, workCycle: 1, resolvedAt: null, resolutionGate: EMPTY_GATE });
    renderDetail([{ ...DETAIL, allowedTransitions: ["IN_PROGRESS"] }]);
    await user.selectOptions(await screen.findByLabelText("Next status"), "IN_PROGRESS");
    await user.click(screen.getByRole("button", { name: "Update status" }));
    expect(await screen.findByText(/status could not be updated/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Update status" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[0]).toEqual([DETAIL.id, "IN_PROGRESS", 1, undefined, expect.any(String)]);
    expect(update.mock.calls[1][4]).toBe(update.mock.calls[0][4]);
  });

  it("requires a Public Comment for Waiting for Requester and submits it with the status mutation", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(ticketsApi, "updateStaffTicketStatus")
      .mockRejectedValueOnce(new ApiError(400, "VALIDATION_FAILED", "invalid"))
      .mockResolvedValueOnce({ currentStatus: "WAITING_FOR_REQUESTER", resolutionIndication: null, allowedTransitions: ["OPEN"], ticketVersion: 2, workCycle: 1, resolvedAt: null, resolutionGate: EMPTY_GATE });
    renderDetail([{ ...DETAIL, allowedTransitions: ["WAITING_FOR_REQUESTER"] }]);
    await user.selectOptions(await screen.findByLabelText("Next status"), "WAITING_FOR_REQUESTER");
    await user.click(screen.getByRole("button", { name: "Update status" }));
    expect(await screen.findByText(/Enter a Public Comment when waiting/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Public Comment for Requester/), "Please test again.");
    await user.click(screen.getByRole("button", { name: "Update status" }));
    expect(update).toHaveBeenLastCalledWith(DETAIL.id, "WAITING_FOR_REQUESTER", 1, "Please test again.", expect.any(String));
  });

  it("shows current-cycle gate blockers and explains legacy resolution dates honestly", async () => {
    const blockedGate: ResolutionGate = {
      canResolve: false,
      reasons: ["UNFINISHED_ACTIONS", "FOLLOW_UP_REQUIRED"],
      completedCount: 1,
      unfinishedCount: 2,
      followUpCount: 1,
    };
    const first = renderDetail([{
      ...DETAIL,
      currentStatus: "IN_PROGRESS",
      workCycle: 2,
      resolutionGate: blockedGate,
      allowedTransitions: ["WAITING_FOR_REQUESTER", "CANCELLED"],
    }]);
    await screen.findByRole("heading", { name: DETAIL.ticketNumber });
    expect(screen.getByLabelText("Resolution requirements")).toHaveTextContent("Cycle 2: 1 completed, 2 unfinished, 1 requiring follow-up.");
    expect(screen.getByLabelText("Resolution requirements")).toHaveTextContent("Finish or cancel the unfinished Actions in this work cycle.");
    expect(screen.queryByRole("option", { name: "Resolved" })).not.toBeInTheDocument();

    first.unmount();
    renderDetail([{ ...DETAIL, currentStatus: "RESOLVED", resolvedAt: null, workCycle: 1, allowedTransitions: ["CLOSED", "REOPENED"] }]);
    expect(await screen.findByTestId("ticket-work-cycle")).toHaveTextContent("Legacy resolution time unknown.");
    expect(screen.getByTestId("ticket-work-cycle")).not.toHaveTextContent("Not resolved in this cycle.");
  });

  it("requires a reason before cancellation and explains the unfinished Action effect", async () => {
    const user = userEvent.setup();
    const cancelled = { ...DETAIL, currentStatus: "CANCELLED" as const, allowedTransitions: [] };
    const update = vi.spyOn(ticketsApi, "updateStaffTicketStatus").mockResolvedValue({
      currentStatus: "CANCELLED",
      resolutionIndication: null,
      allowedTransitions: [],
      ticketVersion: 2,
      workCycle: 1,
      resolvedAt: null,
      resolutionGate: EMPTY_GATE,
    });
    renderDetail([{ ...DETAIL, allowedTransitions: ["CANCELLED"] }, cancelled]);
    await user.selectOptions(await screen.findByLabelText("Next status"), "CANCELLED");
    await user.click(screen.getByRole("button", { name: "Update status" }));
    expect(await screen.findByText("Enter a reason before cancelling this Ticket.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Cancellation reason/), "Requester withdrew the work");
    await user.click(screen.getByRole("button", { name: "Update status" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("All unfinished Actions in the current work cycle will be cancelled");
    await user.click(within(dialog).getByRole("button", { name: "Confirm Cancelled" }));
    expect(update).toHaveBeenCalledWith(DETAIL.id, "CANCELLED", 1, undefined, expect.any(String), "Requester withdrew the work");
  });

  it("clears a cancellation reason when navigating to another Ticket", async () => {
    const user = userEvent.setup();
    const nextTicket = {
      ...DETAIL,
      id: 43,
      ticketNumber: "TKT-2026-000043",
      allowedTransitions: ["CANCELLED" as const],
    };
    const update = vi.spyOn(ticketsApi, "updateStaffTicketStatus");
    renderDetail([{ ...DETAIL, allowedTransitions: ["CANCELLED"] }, nextTicket], true);

    await user.selectOptions(await screen.findByLabelText("Next status"), "CANCELLED");
    await user.type(await screen.findByLabelText(/Cancellation reason/), "Ticket 42 reason");
    await user.click(screen.getByRole("link", { name: "Open next Ticket" }));
    expect(await screen.findByRole("heading", { name: nextTicket.ticketNumber })).toBeInTheDocument();

    await user.selectOptions(await screen.findByLabelText("Next status"), "CANCELLED");
    expect(screen.getByLabelText(/Cancellation reason/)).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Update status" }));
    expect(await screen.findByText("Enter a reason before cancelling this Ticket.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it("ignores a stale Action-parent refresh after navigating away and back to the same Ticket", async () => {
    const user = userEvent.setup();
    const pendingRefresh = deferred<TicketDetail>();
    const currentTicket = { ...DETAIL, summary: "Current route version of Ticket 42" };
    const nextTicket = { ...DETAIL, id: 43, ticketNumber: "TKT-2026-000043", summary: "Ticket 43" };
    let ticket42Reads = 0;
    const { fetch } = renderDetail([], true, async (ticketId) => {
      if (ticketId === 43) return nextTicket;
      ticket42Reads += 1;
      if (ticket42Reads === 1) return DETAIL;
      if (ticket42Reads === 2) return pendingRefresh.promise;
      return currentTicket;
    });

    const action: TicketAction = {
      id: 80, ticketId: 42, workCycle: 1, status: "PLANNED", description: "Add a browser-created Action",
      result: null, actionAt: "2026-09-02T10:00:00.000Z", assignee: OWNER, assigneeEligible: true,
      createdBy: OWNER, performedBy: null, followUpRequired: false, followUpNote: null, attachmentNotes: null,
      version: 1, createdAt: "2026-09-02T10:01:00.000Z", updatedAt: "2026-09-02T10:01:00.000Z",
      completedAt: null, cancelledAt: null, cancelledBy: null, cancelReason: null,
      permissions: { canEdit: true, allowedTransitions: ["COMPLETED"] },
    };
    vi.spyOn(actionsApi, "fetchEligibleActionOwners").mockResolvedValue([OWNER, ADMIN]);
    vi.spyOn(actionsApi, "fetchStaffActions").mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0, totalPages: 0, ticketVersion: 1, workCycle: 1 } satisfies ActionPage);
    vi.spyOn(actionsApi, "fetchStaffWorkflow").mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0, totalPages: 0 });
    vi.spyOn(actionsApi, "createStaffAction").mockResolvedValue({ action, ticketVersion: 2 });

    await screen.findByRole("heading", { name: DETAIL.ticketNumber });
    await user.click(screen.getByRole("tab", { name: "Actions Taken" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "New Action" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "New Action" }));
    await user.type(screen.getByLabelText(/^Action Description/), "Add a browser-created Action");
    await user.click(screen.getByRole("button", { name: "Save Planned Action" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole("link", { name: "Open next Ticket" }));
    await screen.findByRole("heading", { name: nextTicket.ticketNumber });
    await user.click(screen.getByRole("link", { name: "Return to first Ticket" }));
    await screen.findByRole("heading", { name: DETAIL.ticketNumber });
    expect(await screen.findByText(currentTicket.summary)).toBeInTheDocument();

    pendingRefresh.resolve({ ...DETAIL, summary: "Stale pre-navigation parent response" });
    await waitFor(() => expect(screen.getByText(currentTicket.summary)).toBeInTheDocument());
    expect(screen.queryByText("Stale pre-navigation parent response")).not.toBeInTheDocument();
  });

  it.each([
    ["RESOLVED", "Confirm Resolved", ""],
    ["REOPENED", "Confirm Reopened", "Reopening starts a fresh work cycle. Earlier-cycle Actions and history remain available as locked, read-only history."],
  ] as const)("requires explicit confirmation before %s", async (status, confirmationLabel, explanation) => {
    const user = userEvent.setup();
    const update = vi.spyOn(ticketsApi, "updateStaffTicketStatus").mockResolvedValue({
      currentStatus: status,
      resolutionIndication: null,
      allowedTransitions: [],
      ticketVersion: 2,
      workCycle: status === "REOPENED" ? 2 : 1,
      resolvedAt: null,
      resolutionGate: EMPTY_GATE,
    });
    renderDetail([{ ...DETAIL, allowedTransitions: [status] }, { ...DETAIL, currentStatus: status, allowedTransitions: [] }]);
    await user.selectOptions(await screen.findByRole("combobox", { name: "Next status" }), status);
    await user.click(screen.getByRole("button", { name: "Update status" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    if (explanation) expect(dialog).toHaveTextContent(explanation);
    expect(update).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: confirmationLabel }));
    expect(update).toHaveBeenCalledWith(DETAIL.id, status, 1, undefined, expect.any(String));
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
