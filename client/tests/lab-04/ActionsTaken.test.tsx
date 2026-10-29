import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { TicketDetailTabs } from "../../src/components/TicketDetailTabs.js";
import { ActionsTakenPanel } from "../../src/components/ActionsTakenPanel.js";
import * as actionsApi from "../../src/api/actions.js";
import { ApiError } from "../../src/lib/http.js";
import type { TicketDetail } from "../../src/types/index.js";
import type { ActionPage, ActionTransition, TicketAction } from "../../src/api/actions.js";

const auth = vi.hoisted(() => ({ user: { id: 10, fullName: "Alex Staff", email: "alex@example.test", role: "STAFF", active: true, mustChangePassword: false } }));
vi.mock("../../src/context/AuthContext.js", () => ({ useAuth: () => ({ user: auth.user }) }));

const STAFF = { id: 10, fullName: "Alex Staff", role: "STAFF" as const };
const ADMIN = { id: 11, fullName: "Ada Admin", role: "ADMIN" as const };
const TICKET: TicketDetail = {
  id: 42,
  ticketNumber: "TKT-2026-000042",
  summary: "VPN access is unavailable",
  description: "The requester cannot connect.",
  requestedPriority: "HIGH",
  currentStatus: "OPEN",
  workCycle: 2,
  resolvedAt: null,
  version: 3,
  serverTime: "2026-10-29T05:00:00.000Z",
  createdAt: "2026-10-28T09:00:00.000Z",
  updatedAt: "2026-10-29T04:00:00.000Z",
  category: { id: 1, name: "Network" },
  relatedSystem: { id: 1, name: "VPN" },
  requester: { id: 20, fullName: "Rita Requester", email: "rita@example.test" },
  owner: STAFF,
  attachments: [],
  allowedTransitions: ["IN_PROGRESS"],
};

const ACTION: TicketAction = {
  id: 51,
  ticketId: 42,
  workCycle: 2,
  status: "PLANNED",
  description: "Inspect the account configuration",
  result: null,
  actionAt: "2026-10-29T02:00:00.000Z",
  assignee: { id: 10, fullName: "Alex Staff" },
  assigneeEligible: true,
  createdBy: { id: 10, fullName: "Alex Staff" },
  performedBy: null,
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  version: 1,
  createdAt: "2026-10-29T02:01:00.000Z",
  updatedAt: "2026-10-29T02:01:00.000Z",
  completedAt: null,
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
  permissions: { canEdit: true, allowedTransitions: ["IN_PROGRESS", "COMPLETED", "CANCELLED"] },
};

const WORKFLOW = {
  data: [{ id: 1, kind: "BASELINE" as const, fromStatus: null, toStatus: "OPEN" as const, workCycle: 1, actor: null, occurredAt: "2026-10-28T09:00:00.000Z", reason: null, publicCommentId: null, label: "Lab 4 migration snapshot; original transition time unknown" }],
  page: 1, pageSize: 10, total: 1, totalPages: 1,
};

function actionPage(data: TicketAction[] = [ACTION], options: Partial<ActionPage> = {}): ActionPage {
  return { data, page: 1, pageSize: 10, total: data.length, totalPages: 1, ticketVersion: 3, workCycle: 2, ...options };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function panelElement(ticket: TicketDetail, url: string, role: "STAFF" | "ADMIN" | "REQUESTER", refreshParent: () => Promise<TicketDetail>) {
  return <MemoryRouter initialEntries={[url]}>
    <ActionsTakenPanel ticket={ticket} viewerRole={role} refreshParent={refreshParent} />
  </MemoryRouter>;
}

function mount(options: { role?: "STAFF" | "ADMIN" | "REQUESTER"; url?: string; ticket?: TicketDetail; refreshParent?: () => Promise<TicketDetail> } = {}) {
  const role = options.role ?? "STAFF";
  const ticket = options.ticket ?? TICKET;
  const refreshParent = options.refreshParent ?? (async () => ({ ...ticket }));
  auth.user = { id: role === "REQUESTER" ? 20 : 10, fullName: role === "REQUESTER" ? "Rita Requester" : "Alex Staff", email: "user@example.test", role, active: true, mustChangePassword: false };
  return render(panelElement(ticket, options.url ?? "/tickets/42?tab=actions", role, refreshParent));
}

beforeEach(() => {
  vi.restoreAllMocks();
  auth.user = { id: 10, fullName: "Alex Staff", email: "alex@example.test", role: "STAFF", active: true, mustChangePassword: false };
  vi.spyOn(actionsApi, "fetchEligibleActionOwners").mockResolvedValue([STAFF, ADMIN]);
  vi.spyOn(actionsApi, "fetchStaffActions").mockResolvedValue(actionPage());
  vi.spyOn(actionsApi, "fetchRequesterActions").mockResolvedValue(actionPage());
  vi.spyOn(actionsApi, "fetchStaffWorkflow").mockResolvedValue(WORKFLOW);
  vi.spyOn(actionsApi, "fetchRequesterWorkflow").mockResolvedValue(WORKFLOW);
  vi.spyOn(actionsApi, "fetchStaffActionHistory").mockResolvedValue({ data: [], page: 1, pageSize: 10, total: 0, totalPages: 0 });
});

describe("Issue #88 Actions Taken", () => {
  it("shows cycle, separate assignee and performer, inactive-assignee warning, and truthful baseline label", async () => {
    const inactive = { ...ACTION, assignee: { id: 13, fullName: "Former Staff" }, assigneeEligible: false };
    vi.spyOn(actionsApi, "fetchStaffActions").mockResolvedValue(actionPage([inactive]));
    mount();

    expect(await screen.findByRole("heading", { name: "Actions Taken" })).toBeInTheDocument();
    expect(await screen.findByText(/Current work cycle 2/)).toBeInTheDocument();
    expect(screen.getAllByText("Former Staff")).toHaveLength(2);
    expect(screen.getAllByText("Not completed").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/inactive or ineligible/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Lab 4 migration snapshot; original transition time unknown")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Actions pages" })).toBeInTheDocument();
  });

  it("creates a Planned Action with an untouched date omitted and sends a scoped idempotency key", async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(actionsApi, "createStaffAction").mockResolvedValue({ action: { ...ACTION, id: 52 }, ticketVersion: 4 });
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "New Action" })).toBeEnabled());
    await user.click(await screen.findByRole("button", { name: "New Action" }));
    const date = await screen.findByLabelText(/^Action Date\/Time \(Bangkok\)/);
    expect(date).toHaveValue("2026-10-29T12:00");
    await user.type(screen.getByLabelText(/^Action Description/), "Review VPN account state");
    await user.click(screen.getByRole("button", { name: "Save Planned Action" }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const [ticketId, body, key] = create.mock.calls[0];
    expect(ticketId).toBe(TICKET.id);
    expect(body).toEqual({ expectedTicketVersion: 3, description: "Review VPN account state", assigneeId: 10, followUpRequired: false });
    expect(key).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("keeps the exact create body and key for an ambiguous server failure retry", async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(actionsApi, "createStaffAction")
      .mockRejectedValueOnce(new ApiError(503, "UNEXPECTED", "temporary"))
      .mockResolvedValueOnce({ action: { ...ACTION, id: 52 }, ticketVersion: 4 });
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "New Action" })).toBeEnabled());
    await user.click(await screen.findByRole("button", { name: "New Action" }));
    await user.type(screen.getByLabelText(/^Action Description/), "Retry without changing this intent");
    await user.click(screen.getByRole("button", { name: "Save Planned Action" }));
    expect(await screen.findByText(/result is unknown/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry exact create" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1]).toEqual(create.mock.calls[0]);
  });

  it("starts a new create intent after the user edits a field following an ambiguous failure", async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(actionsApi, "createStaffAction")
      .mockRejectedValueOnce(new ApiError(503, "UNEXPECTED", "temporary"))
      .mockResolvedValueOnce({ action: { ...ACTION, id: 52 }, ticketVersion: 4 });
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "New Action" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "New Action" }));
    await user.type(screen.getByLabelText(/^Action Description/), "Initial attempt");
    await user.click(screen.getByRole("button", { name: "Save Planned Action" }));
    expect(await screen.findByText(/result is unknown/i)).toBeInTheDocument();
    const firstKey = create.mock.calls[0][2];
    await user.clear(screen.getByLabelText(/^Action Description/));
    await user.type(screen.getByLabelText(/^Action Description/), "Edited as a new intent");
    await user.click(screen.getByRole("button", { name: "Save Planned Action" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1][2]).not.toBe(firstKey);
    expect(create.mock.calls[1][1].description).toBe("Edited as a new intent");
  });

  it("parses a user-edited datetime-local value as Bangkok +07 and validates against server time", async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(actionsApi, "createStaffAction").mockResolvedValue({ action: { ...ACTION, id: 52 }, ticketVersion: 4 });
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "New Action" })).toBeEnabled());
    await user.click(await screen.findByRole("button", { name: "New Action" }));
    await user.type(screen.getByLabelText(/^Action Description/), "Check a timestamp");
    fireEvent.change(screen.getByLabelText(/^Action Date\/Time \(Bangkok\)/), { target: { value: "2026-10-29T13:00" } });
    await user.click(screen.getByRole("button", { name: "Save Planned Action" }));
    expect(await screen.findByText(/cannot be in the future/i)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^Action Date\/Time \(Bangkok\)/), { target: { value: "2026-10-29T11:00" } });
    await user.click(screen.getByRole("button", { name: "Save Planned Action" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][1].actionAt).toBe("2026-10-29T04:00:00.000Z");
  });

  it("advances the future-date boundary using elapsed monotonic time while the page stays open", async () => {
    let monotonicNow = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => monotonicNow);
    const create = vi.spyOn(actionsApi, "createStaffAction").mockResolvedValue({ action: { ...ACTION, id: 52 }, ticketVersion: 4 });
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "New Action" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "New Action" }));
    fireEvent.change(await screen.findByLabelText(/^Action Description/), { target: { value: "Record a delayed observation" } });
    fireEvent.change(screen.getByLabelText(/^Action Date\/Time \(Bangkok\)/), { target: { value: "2026-10-29T12:20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Planned Action" }));
    expect(await screen.findByText(/cannot be in the future/i)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    monotonicNow += 21 * 60 * 1000;
    fireEvent.click(screen.getByRole("button", { name: "Save Planned Action" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][1].actionAt).toBe("2026-10-29T05:20:00.000Z");
  });

  it("renders readable changed-field history without exposing a JSON snapshot", async () => {
    const user = userEvent.setup();
    vi.spyOn(actionsApi, "fetchStaffActionHistory").mockResolvedValue({
      data: [{ id: 1, actionId: ACTION.id, sequence: 2, operation: "EDIT", actor: STAFF, occurredAt: "2026-10-29T03:00:00.000Z", reason: null, before: { description: "Old description" }, after: { description: "New description" } }],
      page: 1, pageSize: 10, total: 1, totalPages: 1,
    });
    mount();
    await user.click((await screen.findAllByRole("button", { name: "View details" }))[0]);
    await user.click(screen.getByRole("button", { name: "View change history" }));
    expect(await screen.findByText("Description:")).toBeInTheDocument();
    expect(screen.getByText(/Old description.*New description/)).toBeInTheDocument();
    expect(screen.queryByText(/\{"description"/)).not.toBeInTheDocument();
  });

  it("uses the Staff single-Action endpoint for an off-page deep link and focuses that Action", async () => {
    const linked = { ...ACTION, id: 99, description: "Deep-linked Action outside page one" };
    vi.spyOn(actionsApi, "fetchStaffActions").mockResolvedValue(actionPage([ACTION], { total: 20, totalPages: 2 }));
    const single = vi.spyOn(actionsApi, "fetchStaffAction").mockResolvedValue({ action: linked, ticketVersion: 3 });
    mount({ url: "/tickets/42?tab=actions&actionId=99" });
    const heading = await screen.findByRole("heading", { name: "Action 99 · Planned" });
    expect(single).toHaveBeenCalledWith(42, 99);
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole("navigation", { name: "Actions pages" })).toBeInTheDocument();
  });

  it("finds Requester deep links through owned paginated reads and never calls Staff history endpoints", async () => {
    const userAction = { ...ACTION, id: 77, version: undefined, permissions: undefined, assigneeEligible: undefined };
    const requesterPage = vi.spyOn(actionsApi, "fetchRequesterActions").mockImplementation(async (_id, page) => page === 1
      ? actionPage([], { page: 1, total: 11, totalPages: 2, ticketVersion: undefined, workCycle: undefined })
      : actionPage([userAction], { page: 2, total: 11, totalPages: 2, ticketVersion: undefined, workCycle: undefined }));
    const single = vi.spyOn(actionsApi, "fetchStaffAction");
    const history = vi.spyOn(actionsApi, "fetchStaffActionHistory");
    mount({ role: "REQUESTER", url: "/tickets/42?tab=actions&actionId=77" });
    expect(await screen.findByRole("heading", { name: "Action 77 · Planned" })).toBeInTheDocument();
    expect(requesterPage).toHaveBeenCalledWith(42, 2, 10);
    expect(single).not.toHaveBeenCalled();
    expect(history).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "View change history" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New Action" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();
  });

  it("starts and completes current-cycle Actions with the captured versions and completion actor kept distinct", async () => {
    const user = userEvent.setup();
    const transition = vi.spyOn(actionsApi, "transitionStaffAction").mockResolvedValue({ action: { ...ACTION, status: "COMPLETED", result: "VPN login works", performedBy: STAFF, completedAt: "2026-10-29T04:30:00.000Z", version: 2 }, ticketVersion: 4 });
    const action = { ...ACTION, permissions: { canEdit: true, allowedTransitions: ["COMPLETED"] as ActionTransition[] } };
    vi.spyOn(actionsApi, "fetchStaffActions").mockResolvedValue(actionPage([action]));
    mount();
    await user.click((await screen.findAllByRole("button", { name: "View details" }))[0]);
    await user.click(screen.getByRole("button", { name: "Complete" }));
    await user.clear(screen.getByLabelText(/^Result/));
    await user.type(screen.getByLabelText(/^Result/), "VPN login works");
    await user.click(screen.getByRole("button", { name: "Confirm Complete" }));
    await waitFor(() => expect(transition).toHaveBeenCalledTimes(1));
    const [ticketId, actionId, body] = transition.mock.calls[0];
    expect([ticketId, actionId]).toEqual([42, ACTION.id]);
    expect(body).toMatchObject({ expectedTicketVersion: 3, expectedActionVersion: 1, status: "COMPLETED", result: "VPN login works" });
    expect(body).not.toHaveProperty("actionAt");
    expect(transition.mock.calls[0][3]).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("retries an ambiguous completion with the exact saved body and idempotency key", async () => {
    const user = userEvent.setup();
    const transition = vi.spyOn(actionsApi, "transitionStaffAction")
      .mockRejectedValueOnce(new ApiError(503, "UNEXPECTED", "temporary"))
      .mockResolvedValueOnce({ action: { ...ACTION, status: "COMPLETED", result: "Verified", performedBy: STAFF, completedAt: "2026-10-29T04:30:00.000Z", version: 2 }, ticketVersion: 4 });
    mount();
    await user.click((await screen.findAllByRole("button", { name: "View details" }))[0]);
    await user.click(screen.getByRole("button", { name: "Complete" }));
    await user.type(screen.getByLabelText(/^Result/), "Verified");
    await user.click(screen.getByRole("button", { name: "Confirm Complete" }));
    expect(await screen.findByText(/result is unknown/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry exact transition" }));
    await waitFor(() => expect(transition).toHaveBeenCalledTimes(2));
    expect(transition.mock.calls[1]).toEqual(transition.mock.calls[0]);
  });

  it("preserves Action timestamp precision for a description-only terminal correction", async () => {
    const user = userEvent.setup();
    const precise = { ...ACTION, status: "COMPLETED" as const, actionAt: "2026-10-29T03:00:45.123Z", result: "Original result", performedBy: STAFF, completedAt: "2026-10-29T04:00:00.000Z", permissions: { canEdit: true, allowedTransitions: [] as ActionTransition[] } };
    const patch = vi.spyOn(actionsApi, "patchStaffAction").mockResolvedValue({ action: { ...precise, description: "Corrected wording", version: 2 }, ticketVersion: 4 });
    vi.spyOn(actionsApi, "fetchStaffActions").mockResolvedValue(actionPage([precise]));
    mount({ ticket: { ...TICKET, createdAt: "2026-10-29T03:00:30.000Z" } });
    await user.click((await screen.findAllByRole("button", { name: "View details" }))[0]);
    await user.click(screen.getByRole("button", { name: "Edit Action" }));
    const description = screen.getByLabelText(/^Action Description/);
    await user.clear(description);
    await user.type(description, "Corrected wording");
    await user.type(screen.getByLabelText(/^Correction Reason/), "Fix a transcription error");
    await user.click(screen.getByRole("button", { name: "Save revision" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][2]).not.toHaveProperty("actionAt");
    expect(patch.mock.calls[0][2]).toMatchObject({ description: "Corrected wording", correctionReason: "Fix a transcription error" });
  });

  it("completes an Action created in the Ticket's first minute without truncating its timestamp", async () => {
    const user = userEvent.setup();
    const firstMinuteAction = { ...ACTION, actionAt: "2026-10-29T03:00:45.123Z", permissions: { canEdit: true, allowedTransitions: ["COMPLETED"] as ActionTransition[] } };
    const transition = vi.spyOn(actionsApi, "transitionStaffAction").mockResolvedValue({ action: { ...firstMinuteAction, status: "COMPLETED", result: "Verified", performedBy: STAFF, completedAt: "2026-10-29T04:30:00.000Z", version: 2 }, ticketVersion: 4 });
    vi.spyOn(actionsApi, "fetchStaffActions").mockResolvedValue(actionPage([firstMinuteAction]));
    mount({ ticket: { ...TICKET, createdAt: "2026-10-29T03:00:30.000Z" } });
    await user.click((await screen.findAllByRole("button", { name: "View details" }))[0]);
    await user.click(screen.getByRole("button", { name: "Complete" }));
    await user.type(screen.getByLabelText(/^Result/), "Verified");
    await user.click(screen.getByRole("button", { name: "Confirm Complete" }));
    await waitFor(() => expect(transition).toHaveBeenCalledTimes(1));
    expect(transition.mock.calls[0][2]).not.toHaveProperty("actionAt");
  });

  it("keeps edit versions captured when a background parent/list refresh advances versions", async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(actionsApi, "patchStaffAction").mockResolvedValue({ action: { ...ACTION, description: "Edited against captured versions", version: 2 }, ticketVersion: 5 });
    const view = mount();
    await user.click((await screen.findAllByRole("button", { name: "View details" }))[0]);
    await user.click(screen.getByRole("button", { name: "Edit Action" }));
    await user.clear(screen.getByLabelText(/^Action Description/));
    await user.type(screen.getByLabelText(/^Action Description/), "Edited against captured versions");

    const latest = { ...ACTION, version: 2, description: "Background edit" };
    vi.mocked(actionsApi.fetchStaffActions).mockResolvedValue(actionPage([latest], { ticketVersion: 4 }));
    view.rerender(panelElement({ ...TICKET, version: 4 }, "/tickets/42?tab=actions", "STAFF", async () => ({ ...TICKET, version: 4 })));
    await waitFor(() => expect(actionsApi.fetchStaffActions).toHaveBeenLastCalledWith(42, 1, 10));
    await user.click(screen.getByRole("button", { name: "Save revision" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][2]).toMatchObject({ expectedTicketVersion: 3, expectedActionVersion: 1, description: "Edited against captured versions" });
  });

  it("retains an inactive assignee label while allowing a descriptive edit without changing assignment", async () => {
    const user = userEvent.setup();
    const inactive = { ...ACTION, assignee: { id: 13, fullName: "Former Staff" }, assigneeEligible: false, permissions: { canEdit: true, allowedTransitions: [] as ActionTransition[] } };
    const patch = vi.spyOn(actionsApi, "patchStaffAction").mockResolvedValue({ action: { ...inactive, description: "Clarified without reassignment", version: 2 }, ticketVersion: 4 });
    vi.spyOn(actionsApi, "fetchStaffActions").mockResolvedValue(actionPage([inactive]));
    mount();
    await user.click((await screen.findAllByRole("button", { name: "View details" }))[0]);
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit Action" }));
    expect(screen.getByRole("option", { name: /Former Staff \(inactive historical assignment\)/ })).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^Action Description/));
    await user.type(screen.getByLabelText(/^Action Description/), "Clarified without reassignment");
    await user.click(screen.getByRole("button", { name: "Save revision" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][2]).not.toHaveProperty("assigneeId");
  });

  it("keeps earlier-cycle Actions readable and hides all mutation controls", async () => {
    const user = userEvent.setup();
    const priorCycle = { ...ACTION, workCycle: 1, permissions: { canEdit: true, allowedTransitions: ["COMPLETED"] as ActionTransition[] } };
    vi.spyOn(actionsApi, "fetchStaffActions").mockResolvedValue(actionPage([priorCycle]));
    mount();
    await user.click((await screen.findAllByRole("button", { name: "View details" }))[0]);
    expect(screen.getByText(/historical, read-only history/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Action" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument();
  });

  it("cancels an Action with an explicit reason without presenting it as completed work", async () => {
    const user = userEvent.setup();
    const planned = { ...ACTION, permissions: { canEdit: true, allowedTransitions: ["CANCELLED"] as ActionTransition[] } };
    const transition = vi.spyOn(actionsApi, "transitionStaffAction").mockResolvedValue({ action: { ...planned, status: "CANCELLED", cancelReason: "Duplicate task", cancelledBy: STAFF, cancelledAt: "2026-10-29T04:30:00.000Z", version: 2 }, ticketVersion: 4 });
    vi.spyOn(actionsApi, "fetchStaffActions").mockResolvedValue(actionPage([planned]));
    mount();
    await user.click((await screen.findAllByRole("button", { name: "View details" }))[0]);
    await user.click(screen.getByRole("button", { name: "Cancel Action" }));
    expect(screen.getByText(/This does not cancel the Ticket/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel form" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel Action" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Cancel Action" }));
    await user.type(screen.getByLabelText(/^Cancellation Reason/), "Duplicate task");
    await user.click(screen.getByRole("button", { name: "Confirm Cancel Action" }));
    await waitFor(() => expect(transition).toHaveBeenCalledTimes(1));
    expect(transition.mock.calls[0][2]).toMatchObject({ status: "CANCELLED", cancelReason: "Duplicate task" });
    expect(transition.mock.calls[0][2]).not.toHaveProperty("result");
  });

  it("preserves an edit draft through conflict reload and submits only after explicit review", async () => {
    const user = userEvent.setup();
    const latest = { ...ACTION, version: 2, description: "Concurrent version" };
    const patch = vi.spyOn(actionsApi, "patchStaffAction")
      .mockRejectedValueOnce(new ApiError(409, "TICKET_VERSION_CONFLICT", "stale"))
      .mockResolvedValueOnce({ action: { ...latest, description: "Reviewed draft", version: 3 }, ticketVersion: 5 });
    const view = mount({ refreshParent: async () => ({ ...TICKET, version: 4 }) });
    await user.click((await screen.findAllByRole("button", { name: "View details" }))[0]);
    await user.click(screen.getByRole("button", { name: "Edit Action" }));
    await user.clear(screen.getByLabelText(/^Action Description/));
    await user.type(screen.getByLabelText(/^Action Description/), "Reviewed draft");
    await user.click(screen.getByRole("button", { name: "Save revision" }));
    expect(await screen.findByText(/draft remains unchanged/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Action Description/)).toHaveValue("Reviewed draft");
    expect(screen.getByRole("button", { name: "Save revision" })).toBeDisabled();

    vi.spyOn(actionsApi, "fetchStaffAction").mockResolvedValue({ action: latest, ticketVersion: 4 });
    await user.click(screen.getByRole("button", { name: "Load latest for comparison" }));
    await screen.findByText(/Latest Ticket version: 4; Action version: 2/);
    await user.click(screen.getByRole("button", { name: /I reviewed these versions/ }));
    expect(screen.getByLabelText(/^Action Description/)).toHaveValue("Reviewed draft");
    await user.click(screen.getByRole("button", { name: "Save revision" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch.mock.calls[1][2]).toMatchObject({ expectedTicketVersion: 4, expectedActionVersion: 2, description: "Reviewed draft" });
    view.unmount();
  });

  it("focuses the first invalid date and completion Result fields", async () => {
    const user = userEvent.setup();
    const invalidDateView = mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "New Action" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "New Action" }));
    await user.type(screen.getByLabelText(/^Action Description/), "A date is required");
    await user.clear(screen.getByLabelText(/^Action Date\/Time \(Bangkok\)/));
    await user.click(screen.getByRole("button", { name: "Save Planned Action" }));
    await waitFor(() => expect(screen.getByLabelText(/^Action Date\/Time \(Bangkok\)/)).toHaveFocus());
    invalidDateView.unmount();

    const action = { ...ACTION, permissions: { canEdit: true, allowedTransitions: ["COMPLETED"] as ActionTransition[] } };
    vi.spyOn(actionsApi, "fetchStaffActions").mockResolvedValue(actionPage([action]));
    const view = mount();
    await user.click((await screen.findAllByRole("button", { name: "View details" }))[0]);
    await user.click(screen.getByRole("button", { name: "Complete" }));
    await user.click(screen.getByRole("button", { name: "Confirm Complete" }));
    await waitFor(() => expect(screen.getByLabelText(/^Result/)).toHaveFocus());
    view.unmount();
  });

  it("confirms discarding a nonempty create draft and returns focus to its opener", async () => {
    const user = userEvent.setup();
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "New Action" })).toBeEnabled());
    const opener = screen.getByRole("button", { name: "New Action" });
    await user.click(opener);
    await user.type(screen.getByLabelText(/^Action Description/), "A draft that must not vanish");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    const keepEditing = await screen.findByRole("button", { name: "Keep editing" });
    expect(keepEditing).toHaveFocus();
    await user.click(keepEditing);
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(await screen.findByRole("button", { name: "Discard draft" }));
    await waitFor(() => expect(opener).toHaveFocus());
    expect(screen.queryByText("A draft that must not vanish")).not.toBeInTheDocument();
  });

  it("returns focus to the Edit control when changes are discarded", async () => {
    const user = userEvent.setup();
    mount();
    await user.click((await screen.findAllByRole("button", { name: "View details" }))[0]);
    const edit = screen.getByRole("button", { name: "Edit Action" });
    await user.click(edit);
    await user.type(screen.getByLabelText(/^Action Description/), "Unsaved change");
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(edit).toHaveFocus());
    expect(screen.queryByDisplayValue("Unsaved change")).not.toBeInTheDocument();
  });

  it("keeps editor controls from replacing a form while its save is pending", async () => {
    const user = userEvent.setup();
    const second = { ...ACTION, id: 52, description: "Second Action", permissions: { canEdit: true, allowedTransitions: ["COMPLETED"] as ActionTransition[] } };
    const pending = deferred<{ action: TicketAction; ticketVersion: number }>();
    const patch = vi.spyOn(actionsApi, "patchStaffAction").mockReturnValue(pending.promise);
    vi.spyOn(actionsApi, "fetchStaffActions").mockResolvedValue(actionPage([ACTION, second]));
    mount();
    await user.click((await screen.findAllByRole("button", { name: "View details" }))[0]);
    await user.click(screen.getByRole("button", { name: "Edit Action" }));
    const description = screen.getByLabelText(/^Action Description/);
    await user.clear(description);
    await user.type(description, "Saving the first Action");
    await user.click(screen.getByRole("button", { name: "Save revision" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "New Action" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "View details" }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByLabelText(/^Action Description/)).toHaveValue("Saving the first Action");
    expect(screen.getByRole("heading", { name: "Edit Action" })).toBeInTheDocument();
    pending.resolve({ action: { ...ACTION, description: "Saving the first Action", version: 2 }, ticketVersion: 4 });
    expect(await screen.findByText(/revision was recorded/i)).toBeInTheDocument();
  });

  it("preserves but disables an Action edit draft when the parent is finalized or its cycle advances", async () => {
    const user = userEvent.setup();
    const patch = vi.spyOn(actionsApi, "patchStaffAction");
    const view = mount();
    await user.click((await screen.findAllByRole("button", { name: "View details" }))[0]);
    await user.click(screen.getByRole("button", { name: "Edit Action" }));
    const description = screen.getByLabelText(/^Action Description/);
    await user.clear(description);
    await user.type(description, "Keep this draft for review");

    await act(async () => {
      view.rerender(panelElement({ ...TICKET, currentStatus: "CLOSED", version: 4, allowedTransitions: [] }, "/tickets/42?tab=actions", "STAFF", async () => ({ ...TICKET, currentStatus: "CLOSED", version: 4 })));
      await Promise.resolve();
      await Promise.resolve();
    });
    const save = screen.getByRole("button", { name: "Save revision" });
    expect(save).toBeDisabled();
    expect(screen.getByLabelText(/^Action Description/)).toHaveValue("Keep this draft for review");
    expect(screen.getByText(/became read-only.*edit draft is preserved/i)).toBeInTheDocument();
    fireEvent.submit(save.closest("form")!);
    expect(patch).not.toHaveBeenCalled();

    await act(async () => {
      view.rerender(panelElement({ ...TICKET, currentStatus: "REOPENED", workCycle: 3, version: 5 }, "/tickets/42?tab=actions", "STAFF", async () => ({ ...TICKET, currentStatus: "REOPENED", workCycle: 3, version: 5 })));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Save revision" })).toBeDisabled();
    expect(screen.getByLabelText(/^Action Description/)).toHaveValue("Keep this draft for review");
  });

  it("preserves but blocks an open transition after the Ticket enters a final status", async () => {
    const user = userEvent.setup();
    const transition = vi.spyOn(actionsApi, "transitionStaffAction");
    const action = { ...ACTION, permissions: { canEdit: true, allowedTransitions: ["COMPLETED"] as ActionTransition[] } };
    vi.spyOn(actionsApi, "fetchStaffActions").mockResolvedValue(actionPage([action]));
    const view = mount();
    await user.click((await screen.findAllByRole("button", { name: "View details" }))[0]);
    await user.click(screen.getByRole("button", { name: "Complete" }));
    await user.type(screen.getByLabelText(/^Result/), "Keep the completion draft");

    await act(async () => {
      view.rerender(panelElement({ ...TICKET, currentStatus: "CANCELLED", version: 4, allowedTransitions: [] }, "/tickets/42?tab=actions", "STAFF", async () => ({ ...TICKET, currentStatus: "CANCELLED", version: 4 })));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Confirm Complete" })).toBeDisabled();
    expect(screen.getByLabelText(/^Result/)).toHaveValue("Keep the completion draft");
    expect(screen.getByText(/became read-only.*transition draft is preserved/i)).toBeInTheDocument();
    fireEvent.submit(screen.getByRole("button", { name: "Confirm Complete" }).closest("form")!);
    expect(transition).not.toHaveBeenCalled();
  });

  it("keeps transition versions captured while a completion form stays open across refresh", async () => {
    const user = userEvent.setup();
    const transition = vi.spyOn(actionsApi, "transitionStaffAction").mockResolvedValue({ action: { ...ACTION, status: "COMPLETED", result: "Verified", performedBy: STAFF, completedAt: "2026-10-29T04:30:00.000Z", version: 2 }, ticketVersion: 5 });
    const view = mount();
    await user.click((await screen.findAllByRole("button", { name: "View details" }))[0]);
    await user.click(screen.getByRole("button", { name: "Complete" }));
    await user.type(screen.getByLabelText(/^Result/), "Verified");

    const latest = { ...ACTION, version: 2, description: "Background edit" };
    vi.mocked(actionsApi.fetchStaffActions).mockResolvedValue(actionPage([latest], { ticketVersion: 4 }));
    view.rerender(panelElement({ ...TICKET, version: 4 }, "/tickets/42?tab=actions", "STAFF", async () => ({ ...TICKET, version: 4 })));
    await waitFor(() => expect(actionsApi.fetchStaffActions).toHaveBeenLastCalledWith(42, 1, 10));
    await user.click(screen.getByRole("button", { name: "Confirm Complete" }));
    await waitFor(() => expect(transition).toHaveBeenCalledTimes(1));
    expect(transition.mock.calls[0][2]).toMatchObject({ expectedTicketVersion: 3, expectedActionVersion: 1, result: "Verified" });
  });

  it("refreshes an off-page deep-linked Action after its successful transition", async () => {
    const user = userEvent.setup();
    const linked = { ...ACTION, id: 99, description: "Off-page work item", permissions: { canEdit: true, allowedTransitions: ["COMPLETED"] as ActionTransition[] } };
    const completed = { ...linked, status: "COMPLETED" as const, result: "Verified", performedBy: STAFF, completedAt: "2026-10-29T04:30:00.000Z", version: 2, permissions: { canEdit: true, allowedTransitions: [] as ActionTransition[] } };
    let singleReads = 0;
    const single = vi.spyOn(actionsApi, "fetchStaffAction").mockImplementation(async () => {
      singleReads += 1;
      return { action: singleReads <= 2 ? linked : completed, ticketVersion: singleReads <= 2 ? 3 : 4 };
    });
    const transition = vi.spyOn(actionsApi, "transitionStaffAction").mockResolvedValue({ action: completed, ticketVersion: 4 });
    vi.spyOn(actionsApi, "fetchStaffActions").mockResolvedValue(actionPage([ACTION], { total: 20, totalPages: 2 }));
    mount({ url: "/tickets/42?tab=actions&actionId=99" });
    await screen.findByRole("heading", { name: "Action 99 · Planned" });
    await waitFor(() => expect(single).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole("button", { name: "Complete" }));
    await user.type(screen.getByLabelText(/^Result/), "Verified");
    await user.click(screen.getByRole("button", { name: "Confirm Complete" }));
    await waitFor(() => expect(transition).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "Action 99 · Completed" })).toBeInTheDocument();
    expect(single).toHaveBeenCalledTimes(3);
  });

  it("does not apply an old create response after in-place navigation to another Ticket", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ action: TicketAction; ticketVersion: number }>();
    const create = vi.spyOn(actionsApi, "createStaffAction").mockReturnValue(pending.promise);
    vi.mocked(actionsApi.fetchStaffActions).mockImplementation(async (ticketId) => actionPage(ticketId === 42 ? [ACTION] : [], { ticketVersion: ticketId === 42 ? 3 : 1 }));
    const view = mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "New Action" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "New Action" }));
    await user.type(screen.getByLabelText(/^Action Description/), "A pending write for the previous Ticket");
    await user.click(screen.getByRole("button", { name: "Save Planned Action" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));

    const otherTicket = { ...TICKET, id: 43, ticketNumber: "TKT-2026-000043", workCycle: 1, version: 1 };
    view.rerender(panelElement(otherTicket, "/tickets/43?tab=actions", "STAFF", async () => otherTicket));
    await waitFor(() => expect(actionsApi.fetchStaffActions).toHaveBeenLastCalledWith(43, 1, 10));
    view.rerender(panelElement(TICKET, "/tickets/42?tab=actions", "STAFF", async () => ({ ...TICKET })));
    await waitFor(() => expect(actionsApi.fetchStaffActions).toHaveBeenLastCalledWith(42, 1, 10));
    pending.resolve({ action: { ...ACTION, id: 52, description: "A pending write for the previous Ticket" }, ticketVersion: 4 });
    await waitFor(() => expect(screen.getByText(/Current work cycle 2/)).toBeInTheDocument());
    expect(screen.queryByText(/Action 52 created/)).not.toBeInTheDocument();
    expect(screen.queryByText("A pending write for the previous Ticket")).not.toBeInTheDocument();
  });

  it("waits to focus a deep-linked Action until the Actions tab is visible", async () => {
    const user = userEvent.setup();
    const pending = deferred<{ action: TicketAction; ticketVersion: number }>();
    vi.spyOn(actionsApi, "fetchStaffAction").mockReturnValue(pending.promise);
    render(<StrictMode><MemoryRouter initialEntries={["/tickets/42?tab=actions&actionId=99"]}>
      <TicketDetailTabs details={<p>Ticket fields</p>} actions={<ActionsTakenPanel ticket={TICKET} viewerRole="STAFF" refreshParent={async () => ({ ...TICKET })} />} />
    </MemoryRouter></StrictMode>);
    await waitFor(() => expect(actionsApi.fetchStaffAction).toHaveBeenCalledWith(42, 99));
    await user.click(screen.getByRole("tab", { name: "Ticket Details" }));
    const linked = { ...ACTION, id: 99, description: "Deferred deep link" };
    pending.resolve({ action: linked, ticketVersion: 3 });
    await waitFor(() => expect(document.getElementById("action-detail-heading-99")).not.toBeNull());
    expect(document.getElementById("action-detail-heading-99")).not.toHaveFocus();
    await user.click(screen.getByRole("tab", { name: "Actions Taken" }));
    await waitFor(() => expect(document.getElementById("action-detail-heading-99")).toHaveFocus());
  });
});
