import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  createStaffAction,
  fetchEligibleActionOwners,
  fetchRequesterActions,
  fetchRequesterWorkflow,
  fetchStaffAction,
  fetchStaffActionHistory,
  fetchStaffActions,
  fetchStaffWorkflow,
  patchStaffAction,
  transitionStaffAction,
  type ActionInput,
  type ActionPage,
  type ActionPatchInput,
  type ActionRevision,
  type ActionStatus,
  type ActionTransition,
  type ActionTransitionInput,
  type PublicWorkflowEvent,
  type TicketAction,
} from "../api/actions.js";
import { useAuth } from "../context/AuthContext.js";
import { FormField } from "./FormField.js";
import { Pagination } from "./Pagination.js";
import { ApiError } from "../lib/http.js";
import { estimateServerTime, fromBangkokDateTimeLocal, toBangkokDateTimeLocal } from "../lib/bangkokDateTime.js";
import type { TicketDetail } from "../types/index.js";

const PAGE_SIZES = [10, 20, 50] as const;
const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
const FIELD_LABELS: Record<string, string> = {
  description: "Description",
  result: "Result",
  actionAt: "Action Date/Time",
  assigneeId: "Assignee ID",
  performedById: "Performed by ID",
  createdById: "Created by ID",
  followUpRequired: "Follow-up required",
  followUpNote: "Follow-up note",
  attachmentNotes: "Attachment notes",
  status: "Status",
  completedAt: "Completed at",
  cancelledAt: "Cancelled at",
  cancelledById: "Cancelled by ID",
  cancelReason: "Cancellation reason",
};

type LoadState = "loading" | "ready" | "error";
type ViewerRole = "STAFF" | "ADMIN" | "REQUESTER";
type PanelFeedback = { message: string; kind: "success" | "error" | "warning" } | null;
type ActionDraft = {
  description: string;
  actionAt: string;
  actionAtTouched: boolean;
  assigneeId: string;
  originalAssigneeId: string;
  expectedTicketVersion: number;
  expectedActionVersion?: number;
  result: string;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
  correctionReason: string;
};
type TransitionDraft = {
  actionId: number;
  expectedTicketVersion: number;
  expectedActionVersion: number;
  status: ActionTransition;
  result: string;
  actionAt: string;
  actionAtTouched: boolean;
  followUpRequired: boolean;
  followUpNote: string;
  cancelReason: string;
};
type ConflictState = {
  scope: "create" | "edit" | "transition";
  actionId?: number;
  ticketVersion: number;
  actionVersion?: number;
  latestTicketVersion?: number;
  latestActionVersion?: number;
  latestStatus?: ActionStatus;
  reviewed: boolean;
};
type RetryIntent = { key: string; body: ActionInput | ActionTransitionInput };

function emptyDraft(ticket: TicketDetail, defaultAssigneeId: number, expectedTicketVersion: number): ActionDraft {
  return {
    description: "",
    actionAt: ticket.serverTime ? toBangkokDateTimeLocal(ticket.serverTime) : "",
    actionAtTouched: false,
    assigneeId: defaultAssigneeId > 0 ? String(defaultAssigneeId) : "",
    originalAssigneeId: "",
    expectedTicketVersion,
    result: "",
    followUpRequired: false,
    followUpNote: "",
    attachmentNotes: "",
    correctionReason: "",
  };
}

function draftFromAction(action: TicketAction, expectedTicketVersion: number): ActionDraft {
  return {
    description: action.description,
    actionAt: toBangkokDateTimeLocal(action.actionAt),
    actionAtTouched: false,
    assigneeId: String(action.assignee.id),
    originalAssigneeId: String(action.assignee.id),
    expectedTicketVersion,
    expectedActionVersion: action.version ?? 1,
    result: action.result ?? "",
    followUpRequired: action.followUpRequired,
    followUpNote: action.followUpNote ?? "",
    attachmentNotes: action.attachmentNotes ?? "",
    correctionReason: "",
  };
}

function blankToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusTitle(status: string): string {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeApiMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 ? error.message : fallback;
}

function actionDateError(value: string, ticket: TicketDetail, serverNow: string): string | null {
  if (!value) return "Enter an Action Date/Time.";
  const instant = fromBangkokDateTimeLocal(value);
  if (!instant) return "Enter a valid Bangkok date and time.";
  if (new Date(instant).getTime() < new Date(ticket.createdAt).getTime()) return "Action Date/Time cannot be before the Ticket was created.";
  if (new Date(instant).getTime() > new Date(serverNow).getTime()) return "Action Date/Time cannot be in the future.";
  return null;
}

function focusFirstInvalid(scope: "create" | "edit" | "transition", field: string, actionId?: number) {
  const prefix = scope === "create" ? "new-action" : scope === "edit" ? "edit-action" : `transition-${field}-${actionId}`;
  const ids: Record<string, string> = scope === "transition"
    ? {
        result: `transition-result-${actionId}`,
        actionAt: `transition-action-at-${actionId}`,
        followUpNote: `transition-follow-up-note-${actionId}`,
        cancelReason: `transition-cancel-reason-${actionId}`,
      }
    : {
        description: `${prefix}-description`,
        actionAt: `${prefix}-action-at`,
        assigneeId: `${prefix}-assigneeId`,
        result: `${prefix}-result`,
        followUpNote: `${prefix}-follow-up-note`,
        attachmentNotes: `${prefix}-attachment-notes`,
        correctionReason: `${prefix}-correction-reason`,
      };
  document.getElementById(ids[field] ?? prefix)?.focus();
}

function publicActorLabel(event: PublicWorkflowEvent): string {
  return event.actor?.fullName ?? "Historical actor not recorded";
}

function changedFields(revision: ActionRevision, people: Map<number, string>): { label: string; before: string; after: string }[] {
  if (!revision.before || !revision.after) return [];
  const keys = new Set([...Object.keys(revision.before), ...Object.keys(revision.after)]);
  return [...keys]
    .filter((key) => JSON.stringify(revision.before?.[key] ?? null) !== JSON.stringify(revision.after?.[key] ?? null))
    .map((key) => ({
      label: FIELD_LABELS[key] ?? statusTitle(key),
      before: displaySnapshotValue(revision.before?.[key], key, people),
      after: displaySnapshotValue(revision.after?.[key], key, people),
    }));
}

function displaySnapshotValue(value: unknown, field: string, people: Map<number, string>): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value)) return formatDate(value);
  if (["assigneeId", "createdById", "performedById", "cancelledById"].includes(field) && typeof value === "number") {
    return people.get(value) ?? `User ID ${value} (historical name unavailable)`;
  }
  if (typeof value === "object") return "Updated";
  return String(value);
}

function ActionDraftFields({
  draft,
  onChange,
  ticket,
  owners,
  mode,
  terminal,
  terminalAssigneeName,
  resultRequired,
  errors,
  busy,
}: {
  draft: ActionDraft;
  onChange: (patch: Partial<ActionDraft>) => void;
  ticket: TicketDetail;
  owners: { id: number; fullName: string; role: "STAFF" | "ADMIN" }[];
  mode: "create" | "edit";
  terminal: boolean;
  terminalAssigneeName?: string;
  resultRequired: boolean;
  errors: Record<string, string>;
  busy: boolean;
}) {
  const prefix = mode === "create" ? "new-action" : "edit-action";
  return (
    <div className="row">
      <div className="col-12 col-lg-6">
        <FormField id={`${prefix}-description`} label="Action Description" required error={errors.description}>
          {({ id, describedBy, invalid }) => <textarea id={id} className={`form-control${invalid ? " is-invalid" : ""}`} rows={3} maxLength={2000} value={draft.description} onChange={(event) => onChange({ description: event.target.value })} aria-describedby={describedBy} aria-invalid={invalid} disabled={busy} />}
        </FormField>
      </div>
      <div className="col-12 col-md-6">
        <FormField id={`${prefix}-action-at`} label="Action Date/Time (Bangkok)" required={mode === "create"} error={errors.actionAt} hint={mode === "create" && !draft.actionAtTouched ? "Shown using the server time. Leave unchanged to let the server record the actual submission time." : undefined}>
          {({ id, describedBy, invalid }) => <input id={id} className={`form-control${invalid ? " is-invalid" : ""}`} type="datetime-local" value={draft.actionAt} onChange={(event) => onChange({ actionAt: event.target.value, actionAtTouched: true })} aria-describedby={describedBy} aria-invalid={invalid} disabled={busy} />}
        </FormField>
      </div>
      <div className="col-12 col-md-6">
        {terminal ? (
          <div className="mb-3"><span className="form-label fw-semibold d-block">Assignee</span><div className="zen-readonly">{terminalAssigneeName ?? owners.find((owner) => String(owner.id) === draft.assigneeId)?.fullName ?? "Historical assignee"}</div></div>
        ) : (
          <FormField id={`${prefix}-assigneeId`} label="Assignee" required error={errors.assigneeId}>
            {({ id, describedBy, invalid }) => <select id={id} className={`form-select${invalid ? " is-invalid" : ""}`} value={draft.assigneeId} onChange={(event) => onChange({ assigneeId: event.target.value })} aria-describedby={describedBy} aria-invalid={invalid} disabled={busy}>
              <option value="">Select an active IT Staff member or Administrator</option>
              {mode === "edit" && draft.originalAssigneeId && !owners.some((owner) => String(owner.id) === draft.originalAssigneeId) && <option value={draft.originalAssigneeId}>{terminalAssigneeName ?? "Historical assignee"} (inactive historical assignment)</option>}
              {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.fullName} — {owner.role === "ADMIN" ? "Administrator" : "IT Staff"}</option>)}
            </select>}
          </FormField>
        )}
      </div>
      <div className="col-12 col-md-6">
        <FormField id={`${prefix}-result`} label="Result" required={resultRequired} error={errors.result}>
          {({ id, describedBy, invalid }) => <textarea id={id} className={`form-control${invalid ? " is-invalid" : ""}`} rows={3} maxLength={2000} value={draft.result} onChange={(event) => onChange({ result: event.target.value })} aria-describedby={describedBy} aria-invalid={invalid} disabled={busy} />}
        </FormField>
      </div>
      <div className="col-12 col-md-6">
        <label className="form-check-label d-flex align-items-center gap-2 mb-2" htmlFor={`${prefix}-follow-up`}>
          <input id={`${prefix}-follow-up`} className="form-check-input mt-0" type="checkbox" checked={draft.followUpRequired} onChange={(event) => onChange({ followUpRequired: event.target.checked })} disabled={busy} />
          Follow-up Required?
        </label>
        <FormField id={`${prefix}-follow-up-note`} label="Follow-up Note" required={draft.followUpRequired} error={errors.followUpNote}>
          {({ id, describedBy, invalid }) => <textarea id={id} className={`form-control${invalid ? " is-invalid" : ""}`} rows={3} maxLength={2000} value={draft.followUpNote} onChange={(event) => onChange({ followUpNote: event.target.value })} aria-describedby={describedBy} aria-invalid={invalid} disabled={busy} />}
        </FormField>
      </div>
      <div className="col-12 col-md-6">
        <FormField id={`${prefix}-attachment-notes`} label="Attachment Notes" error={errors.attachmentNotes} hint="Refer to files already attached to this Ticket; this does not upload a file.">
          {({ id, describedBy, invalid }) => <textarea id={id} className={`form-control${invalid ? " is-invalid" : ""}`} rows={3} maxLength={1000} value={draft.attachmentNotes} onChange={(event) => onChange({ attachmentNotes: event.target.value })} aria-describedby={describedBy} aria-invalid={invalid} disabled={busy} />}
        </FormField>
      </div>
      {terminal && mode === "edit" && <div className="col-12">
        <FormField id={`${prefix}-correction-reason`} label="Correction Reason" required error={errors.correctionReason}>
          {({ id, describedBy, invalid }) => <textarea id={id} className={`form-control${invalid ? " is-invalid" : ""}`} rows={2} maxLength={1000} value={draft.correctionReason} onChange={(event) => onChange({ correctionReason: event.target.value })} aria-describedby={describedBy} aria-invalid={invalid} disabled={busy} />}
        </FormField>
      </div>}
      <span className="visually-hidden" data-ticket-date-min={ticket.createdAt} />
    </div>
  );
}

function statusBadge(status: ActionStatus) {
  return <span className={`zen-badge zen-action-status zen-action-${status.toLowerCase()}`}>{ACTION_STATUS_LABEL[status]}</span>;
}

export function ActionsTakenPanel({
  ticket,
  viewerRole,
  refreshParent,
}: {
  ticket: TicketDetail;
  viewerRole: ViewerRole;
  refreshParent?: () => Promise<TicketDetail>;
}) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const targetActionId = Number(searchParams.get("actionId"));
  const actionsTabSelected = searchParams.get("tab") === "actions";
  const resolvedRole = user?.role ?? viewerRole;
  const isStaff = resolvedRole !== "REQUESTER";
  const operationIdentity = `${ticket.id}:${user?.id ?? "anonymous"}:${resolvedRole}`;
  const operationScope = useRef({ identity: operationIdentity, generation: 0 });
  if (operationScope.current.identity !== operationIdentity) {
    operationScope.current = { identity: operationIdentity, generation: operationScope.current.generation + 1 };
  }
  const [viewScope, setViewScope] = useState(operationScope.current);
  const isWritableParent = !["RESOLVED", "CLOSED", "CANCELLED"].includes(ticket.currentStatus);
  const currentCycle = ticket.workCycle ?? 1;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [workflowPage, setWorkflowPage] = useState(1);
  const [actionsPage, setActionsPage] = useState<ActionPage | null>(null);
  const [workflow, setWorkflow] = useState<{ data: PublicWorkflowEvent[]; page: number; pageSize: number; total: number; totalPages: number } | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [workflowState, setWorkflowState] = useState<LoadState>("loading");
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [panelFeedback, setPanelFeedback] = useState<PanelFeedback>(null);
  const [owners, setOwners] = useState<{ id: number; fullName: string; role: "STAFF" | "ADMIN" }[]>([]);
  const [ownerState, setOwnerState] = useState<LoadState>("loading");
  const [createOpen, setCreateOpen] = useState(false);
  const [discardCreateConfirm, setDiscardCreateConfirm] = useState(false);
  const [createDraft, setCreateDraft] = useState<ActionDraft>(() => emptyDraft(ticket, user?.id ?? 0, ticket.version ?? 1));
  const [createBusy, setCreateBusy] = useState(false);
  const [expandedActionId, setExpandedActionId] = useState<number | null>(null);
  const [focusedActionId, setFocusedActionId] = useState<number | null>(null);
  const [linkedAction, setLinkedAction] = useState<TicketAction | null>(null);
  const [linkedActionError, setLinkedActionError] = useState<string | null>(null);
  const [editAction, setEditAction] = useState<TicketAction | null>(null);
  const [editDraft, setEditDraft] = useState<ActionDraft | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [transitionDraft, setTransitionDraft] = useState<TransitionDraft | null>(null);
  const [transitionBusy, setTransitionBusy] = useState(false);
  const editorBusy = createBusy || editBusy || transitionBusy;
  const [historyActionId, setHistoryActionId] = useState<number | null>(null);
  const [histories, setHistories] = useState<Record<number, { data: ActionRevision[]; page: number; pageSize: number; total: number; totalPages: number }>>({});
  const [historyPages, setHistoryPages] = useState<Record<number, number>>({});
  const [historyReload, setHistoryReload] = useState(0);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const createControlsBusy = editorBusy && !createBusy;
  const editControlsBusy = editorBusy && !editBusy;
  const transitionControlsBusy = editorBusy && !transitionBusy;
  const createIntent = useRef<RetryIntent | null>(null);
  const transitionIntents = useRef(new Map<number, RetryIntent>());
  const actionHeadings = useRef(new Map<number, HTMLElement>());
  const newActionButton = useRef<HTMLButtonElement | null>(null);
  const focusReturnTarget = useRef<HTMLElement | null>(null);
  const linkHandled = useRef("");
  const refreshParentRef = useRef(refreshParent);
  const linkedActionIdRef = useRef<number | null>(linkedAction?.id ?? null);
  const serverClock = useRef({ ticketId: ticket.id, serverTime: ticket.serverTime ?? ticket.updatedAt, receivedAt: performance.now() });
  refreshParentRef.current = refreshParent;
  linkedActionIdRef.current = linkedAction?.id ?? null;
  if (serverClock.current.ticketId !== ticket.id || serverClock.current.serverTime !== (ticket.serverTime ?? ticket.updatedAt)) {
    serverClock.current = { ticketId: ticket.id, serverTime: ticket.serverTime ?? ticket.updatedAt, receivedAt: performance.now() };
  }
  const serverNow = () => estimateServerTime(serverClock.current.serverTime, serverClock.current.receivedAt, performance.now());
  const currentTicketVersion = actionsPage?.ticketVersion ?? ticket.version ?? 1;

  useEffect(() => {
    const scope = operationScope.current;
    return () => {
      if (operationScope.current === scope) {
        operationScope.current = { identity: scope.identity, generation: scope.generation + 1 };
      }
    };
  }, [operationIdentity]);

  useEffect(() => {
    setPage(1);
    setWorkflowPage(1);
    setActionsPage(null);
    setWorkflow(null);
    setLinkedAction(null);
    setLinkedActionError(null);
    setEditAction(null);
    setEditDraft(null);
    setTransitionDraft(null);
    setCreateOpen(false);
    setDiscardCreateConfirm(false);
    setCreateDraft(emptyDraft(ticket, user?.id ?? 0, ticket.version ?? 1));
    setOwners([]);
    setOwnerState("loading");
    setExpandedActionId(null);
    setFocusedActionId(null);
    setConflict(null);
    setHistoryActionId(null);
    setHistories({});
    setHistoryPages({});
    setPanelFeedback(null);
    setStale(false);
    setRefreshing(false);
    setCreateBusy(false);
    setEditBusy(false);
    setTransitionBusy(false);
    focusReturnTarget.current = null;
    createIntent.current = null;
    transitionIntents.current.clear();
    linkHandled.current = "";
    setViewScope(operationScope.current);
  }, [ticket.id, user?.id, user?.role, viewerRole]);

  useEffect(() => {
    if (createOpen && !createDraft.actionAtTouched && ticket.serverTime) {
      setCreateDraft((draft) => draft.actionAtTouched ? draft : { ...draft, actionAt: toBangkokDateTimeLocal(ticket.serverTime!) });
    }
  }, [createOpen, createDraft.actionAtTouched, ticket.serverTime]);

  useEffect(() => {
    if (discardCreateConfirm) document.getElementById("keep-create-action-editing")?.focus();
  }, [discardCreateConfirm]);

  useEffect(() => {
    if (!isStaff) return;
    let active = true;
    setOwnerState("loading");
    fetchEligibleActionOwners().then((items) => {
      if (!active) return;
      setOwners(items);
      setOwnerState("ready");
      setCreateDraft((draft) => draft.assigneeId ? draft : { ...draft, assigneeId: String(user?.id ?? "") });
    }).catch(() => {
      if (active) setOwnerState("error");
    });
    return () => { active = false; };
  }, [isStaff, ticket.id, user?.id, resolvedRole]);

  useEffect(() => {
    let active = true;
    setLoadState("loading");
    const load = isStaff
      ? fetchStaffActions(ticket.id, page, pageSize)
      : fetchRequesterActions(ticket.id, page, pageSize);
    load.then((result) => {
      if (!active) return;
      setActionsPage(result);
      setLoadState("ready");
    }).catch(() => {
      if (!active) return;
      setLoadState("error");
      setStale(true);
    });
    return () => { active = false; };
  }, [ticket.id, ticket.version, ticket.currentStatus, currentCycle, isStaff, resolvedRole, user?.id, page, pageSize, refreshKey]);

  useEffect(() => {
    let active = true;
    setWorkflowState("loading");
    const load = isStaff
      ? fetchStaffWorkflow(ticket.id, workflowPage, 10)
      : fetchRequesterWorkflow(ticket.id, workflowPage, 10);
    load.then((result) => {
      if (!active) return;
      setWorkflow(result);
      setWorkflowState("ready");
    }).catch(() => {
      if (active) {
        setWorkflowState("error");
        setStale(true);
      }
    });
    return () => { active = false; };
  }, [ticket.id, ticket.version, ticket.currentStatus, currentCycle, isStaff, resolvedRole, user?.id, workflowPage, refreshKey]);

  useEffect(() => {
    const key = `${ticket.id}:${user?.id ?? "anonymous"}:${resolvedRole}:${targetActionId}`;
    if (!Number.isInteger(targetActionId) || targetActionId <= 0 || linkHandled.current === key) return;
    linkHandled.current = key;
    setLinkedActionError(null);
    if (isStaff) {
      let active = true;
      fetchStaffAction(ticket.id, targetActionId).then(({ action }) => {
        if (!active) return;
        setLinkedAction(action);
        setExpandedActionId(action.id);
        setFocusedActionId(action.id);
      }).catch((error: unknown) => {
        if (active) setLinkedActionError(error instanceof ApiError && error.status === 404 ? "This Action was not found for the current Ticket." : "The linked Action could not be loaded.");
      });
      return () => { active = false; };
    }
    let active = true;
    void (async () => {
      try {
        let currentPage = 1;
        let match: TicketAction | undefined;
        let totalPages = 1;
        do {
          const result = await fetchRequesterActions(ticket.id, currentPage, pageSize);
          if (!active) return;
          totalPages = result.totalPages;
          match = result.data.find((action) => action.id === targetActionId);
          if (match) {
            setPage(currentPage);
            setExpandedActionId(match.id);
            setFocusedActionId(match.id);
            return;
          }
          currentPage += 1;
        } while (currentPage <= totalPages);
        setLinkedActionError("This Action was not found for the current Ticket.");
      } catch {
        if (active) setLinkedActionError("The linked Action could not be loaded.");
      }
    })();
    return () => { active = false; };
  }, [ticket.id, user?.id, resolvedRole, targetActionId, isStaff, pageSize]);

  useEffect(() => {
    if (!isStaff || !linkedAction) return;
    const scope = operationScope.current;
    const linkedId = linkedAction.id;
    let active = true;
    fetchStaffAction(ticket.id, linkedId).then(({ action }) => {
      if (active && operationScope.current === scope) setLinkedAction(action);
    }).catch(() => {
      if (active && operationScope.current === scope) {
        setLinkedActionError("The linked Action could not be refreshed; details may be stale.");
        setStale(true);
      }
    });
    return () => { active = false; };
  }, [ticket.id, ticket.version, ticket.currentStatus, currentCycle, isStaff, linkedAction?.id]);

  useEffect(() => {
    if (!focusedActionId) return;
    if (!actionsTabSelected) return;
    const frame = requestAnimationFrame(() => actionHeadings.current.get(focusedActionId)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [actionsTabSelected, focusedActionId, actionsPage, linkedAction]);

  useEffect(() => {
    if (!historyActionId || !isStaff) return;
    const historyPage = historyPages[historyActionId] ?? 1;
    let active = true;
    fetchStaffActionHistory(ticket.id, historyActionId, historyPage, 10).then((result) => {
      if (active) setHistories((current) => ({ ...current, [historyActionId]: result }));
    }).catch(() => {
      if (active) setPanelFeedback({ kind: "error", message: "Action history could not be loaded. Please retry." });
    });
    return () => { active = false; };
  }, [historyActionId, ticket.id, historyPages, historyReload, isStaff, resolvedRole, user?.id]);

  async function refreshAll() {
    const scope = operationScope.current;
    const ticketId = ticket.id;
    const linkedId = linkedActionIdRef.current;
    setRefreshing(true);
    try {
      const latest = await refreshParentRef.current?.();
      if (operationScope.current !== scope) return;
      const version = latest?.version ?? currentTicketVersion;
      const [nextActions, nextWorkflow, nextLinked] = await Promise.all([
        isStaff ? fetchStaffActions(ticketId, page, pageSize) : fetchRequesterActions(ticketId, page, pageSize),
        isStaff ? fetchStaffWorkflow(ticketId, workflowPage, 10) : fetchRequesterWorkflow(ticketId, workflowPage, 10),
        isStaff && linkedId ? fetchStaffAction(ticketId, linkedId) : Promise.resolve(null),
      ]);
      if (operationScope.current !== scope) return;
      setActionsPage(nextActions);
      setWorkflow(nextWorkflow);
      if (nextLinked) setLinkedAction(nextLinked.action);
      setRefreshKey((key) => key + 1);
      setStale(false);
      setLoadState("ready");
      setWorkflowState("ready");
      setHistoryReload((key) => key + 1);
      setPanelFeedback({ kind: "success", message: `Latest Ticket, Actions, and workflow loaded${version ? ` (Ticket version ${version})` : ""}.` });
    } catch {
      if (operationScope.current !== scope) return;
      setStale(true);
      setPanelFeedback({ kind: "error", message: "Some saved data could not be refreshed. The content below is stale; retry before making changes." });
    } finally {
      if (operationScope.current === scope) setRefreshing(false);
    }
  }

  function retryOwners() {
    const scope = operationScope.current;
    setOwnerState("loading");
    fetchEligibleActionOwners().then((items) => {
      if (operationScope.current !== scope) return;
      setOwners(items);
      setOwnerState("ready");
    }).catch(() => {
      if (operationScope.current === scope) setOwnerState("error");
    });
  }

  function draftChanged(scope: ConflictState["scope"], actionId?: number) {
    if (scope === "create") createIntent.current = null;
    if (scope === "transition" && actionId !== undefined) transitionIntents.current.delete(actionId);
    setFieldErrors({});
    setPanelFeedback(null);
    if (conflict?.scope === scope && conflict.actionId === actionId) setConflict((current) => current ? { ...current, reviewed: false } : null);
  }

  function returnFocusToTrigger() {
    requestAnimationFrame(() => {
      if (focusReturnTarget.current?.isConnected) focusReturnTarget.current.focus();
      else newActionButton.current?.focus();
    });
  }

  function openCreate(event: React.MouseEvent<HTMLButtonElement>) {
    if (stale || !isWritableParent || ownerState !== "ready") return;
    focusReturnTarget.current = event.currentTarget;
    if (!createIntent.current) setCreateDraft(emptyDraft(ticket, user?.id ?? 0, currentTicketVersion));
    setCreateOpen(true);
    setDiscardCreateConfirm(false);
    setFieldErrors({});
    setPanelFeedback(null);
    requestAnimationFrame(() => document.getElementById("new-action-description")?.focus());
  }

  function requestCloseCreate(event: React.MouseEvent<HTMLButtonElement>) {
    focusReturnTarget.current = event.currentTarget;
    if (createIntent.current) {
      setCreateOpen(false);
      returnFocusToTrigger();
      return;
    }
    const hasDraft = Boolean(createDraft.description || createDraft.result || createDraft.followUpNote || createDraft.attachmentNotes || createDraft.actionAtTouched || createDraft.followUpRequired || createDraft.assigneeId !== String(user?.id ?? ""));
    if (hasDraft) {
      setDiscardCreateConfirm(true);
      return;
    }
    setCreateOpen(false);
    returnFocusToTrigger();
  }

  function validateDraft(draft: ActionDraft, mode: "create" | "edit", terminal: boolean, resultRequired = false): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!draft.description.trim()) errors.description = "Enter an Action Description.";
    else if (draft.description.length > 2000) errors.description = "Action Description must be 2,000 characters or fewer.";
    if ((mode === "create" && !draft.assigneeId) || (mode === "edit" && !terminal && draft.assigneeId !== draft.originalAssigneeId && !owners.some((owner) => String(owner.id) === draft.assigneeId))) errors.assigneeId = "Choose an active eligible assignee.";
    if (draft.actionAtTouched) {
      const dateError = actionDateError(draft.actionAt, ticket, serverNow());
      if (dateError) errors.actionAt = dateError;
    }
    if (draft.followUpNote.length > 2000) errors.followUpNote = "Follow-up Note must be 2,000 characters or fewer.";
    if (draft.followUpRequired && !draft.followUpNote.trim()) errors.followUpNote = "Enter a Follow-up Note when follow-up is required.";
    if (draft.result.length > 2000) errors.result = "Result must be 2,000 characters or fewer.";
    if (resultRequired && !draft.result.trim()) errors.result = "Result is required for a Completed Action correction.";
    if (draft.attachmentNotes.length > 1000) errors.attachmentNotes = "Attachment Notes must be 1,000 characters or fewer.";
    if (terminal && mode === "edit" && !draft.correctionReason.trim()) errors.correctionReason = "Enter a Correction Reason for terminal Action changes.";
    if (terminal && draft.correctionReason.length > 1000) errors.correctionReason = "Correction Reason must be 1,000 characters or fewer.";
    return errors;
  }

  function normalizedCreateBody(version: number): ActionInput {
    const body: ActionInput = {
      expectedTicketVersion: version,
      description: createDraft.description.trim(),
      assigneeId: Number(createDraft.assigneeId),
      followUpRequired: createDraft.followUpRequired,
    };
    if (createDraft.actionAtTouched) {
      const actionAt = fromBangkokDateTimeLocal(createDraft.actionAt);
      if (actionAt) body.actionAt = actionAt;
    }
    const result = blankToUndefined(createDraft.result);
    const followUpNote = blankToUndefined(createDraft.followUpNote);
    const attachmentNotes = blankToUndefined(createDraft.attachmentNotes);
    if (result) body.result = result;
    if (followUpNote) body.followUpNote = followUpNote;
    if (attachmentNotes) body.attachmentNotes = attachmentNotes;
    return body;
  }

  async function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stale || !isWritableParent || createBusy) return;
    const errors = validateDraft(createDraft, "create", false);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      focusFirstInvalid("create", Object.keys(errors)[0]);
      return;
    }
    const reviewed = conflict?.scope === "create" && conflict.reviewed ? conflict.latestTicketVersion : undefined;
    const body = normalizedCreateBody(reviewed ?? createDraft.expectedTicketVersion);
    let intent = createIntent.current;
    if (!intent) {
      intent = { key: crypto.randomUUID(), body };
      createIntent.current = intent;
    }
    const scope = operationScope.current;
    setCreateBusy(true);
    setPanelFeedback(null);
    try {
      const result = await createStaffAction(ticket.id, intent.body as ActionInput, intent.key);
      if (operationScope.current !== scope) return;
      createIntent.current = null;
      setCreateOpen(false);
      setCreateDraft(emptyDraft(ticket, user?.id ?? 0, result.ticketVersion));
      setConflict(null);
      setLinkedAction(result.action);
      setPanelFeedback({ kind: "success", message: `Action ${result.action.id} created. Refreshing Ticket and history.` });
      setFocusedActionId(result.action.id);
      setExpandedActionId(result.action.id);
      await refreshAll();
    } catch (error) {
      if (operationScope.current !== scope) return;
      const ambiguous = !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
      if (!ambiguous) createIntent.current = null;
      if (error instanceof ApiError && error.status === 409) {
        setConflict({ scope: "create", ticketVersion: body.expectedTicketVersion, reviewed: false });
        setPanelFeedback({ kind: "warning", message: "Ticket changed before this Action was created. Your draft is preserved; load and review the latest Ticket before choosing whether to retry." });
      } else {
        setPanelFeedback({ kind: "error", message: ambiguous ? "The result is unknown. Retry this exact submission, or edit a field to start a new Action." : safeApiMessage(error, "The Action could not be created. Review the fields and try again.") });
      }
      if (error instanceof ApiError) setFieldErrors(Object.fromEntries(error.details.map((issue) => [issue.field, issue.message])));
    } finally {
      if (operationScope.current === scope) setCreateBusy(false);
    }
  }

  function openEdit(action: TicketAction, trigger: HTMLButtonElement) {
    if (stale || !action.permissions?.canEdit || action.workCycle !== currentCycle || !isWritableParent) return;
    focusReturnTarget.current = trigger;
    setEditAction(action);
    setEditDraft(draftFromAction(action, currentTicketVersion));
    setExpandedActionId(action.id);
    setPanelFeedback(null);
    setFieldErrors({});
  }

  function closeEdit() {
    setEditAction(null);
    setEditDraft(null);
    setFieldErrors({});
    returnFocusToTrigger();
  }

  async function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editAction || !editDraft || stale || editBusy) return;
    if (!isWritableParent || editAction.workCycle !== currentCycle) {
      setPanelFeedback({ kind: "warning", message: "This Ticket or Action is now read-only. Your edit draft is preserved for review; reopen the Ticket or start a new work cycle before saving." });
      return;
    }
    const terminal = editAction.status === "COMPLETED" || editAction.status === "CANCELLED";
    const resultRequired = editAction.status === "COMPLETED";
    const errors = validateDraft(editDraft, "edit", terminal, resultRequired);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      focusFirstInvalid("edit", Object.keys(errors)[0]);
      return;
    }
    const approved = conflict?.scope === "edit" && conflict.actionId === editAction.id && conflict.reviewed;
    const body: ActionPatchInput = {
      expectedTicketVersion: approved ? conflict.latestTicketVersion! : editDraft.expectedTicketVersion,
      expectedActionVersion: approved ? conflict.latestActionVersion! : editDraft.expectedActionVersion ?? editAction.version ?? 1,
      description: editDraft.description.trim(),
      ...(editDraft.actionAtTouched && fromBangkokDateTimeLocal(editDraft.actionAt) ? { actionAt: fromBangkokDateTimeLocal(editDraft.actionAt)! } : {}),
      ...(!terminal && editDraft.assigneeId !== editDraft.originalAssigneeId ? { assigneeId: Number(editDraft.assigneeId) } : {}),
      ...(blankToUndefined(editDraft.result) ? { result: blankToUndefined(editDraft.result)! } : { result: "" }),
      followUpRequired: editDraft.followUpRequired,
      ...(blankToUndefined(editDraft.followUpNote) ? { followUpNote: blankToUndefined(editDraft.followUpNote)! } : { followUpNote: "" }),
      ...(blankToUndefined(editDraft.attachmentNotes) ? { attachmentNotes: blankToUndefined(editDraft.attachmentNotes)! } : { attachmentNotes: "" }),
      ...(terminal ? { correctionReason: editDraft.correctionReason.trim() } : {}),
    };
    const scope = operationScope.current;
    setEditBusy(true);
    setPanelFeedback(null);
    try {
      const result = await patchStaffAction(ticket.id, editAction.id, body);
      if (operationScope.current !== scope) return;
      setPanelFeedback({ kind: "success", message: `Action ${result.action.id} updated. A revision was recorded.` });
      setEditAction(null);
      setEditDraft(null);
      setConflict(null);
      setHistoryActionId(result.action.id);
      setHistoryPages((current) => ({ ...current, [result.action.id]: 1 }));
      setFocusedActionId(result.action.id);
      await refreshAll();
    } catch (error) {
      if (operationScope.current !== scope) return;
      if (error instanceof ApiError && error.status === 409) {
        setConflict({ scope: "edit", actionId: editAction.id, ticketVersion: body.expectedTicketVersion, actionVersion: body.expectedActionVersion, reviewed: false });
        setPanelFeedback({ kind: "warning", message: "Ticket or Action changed before this correction was saved. Your draft remains unchanged; load and compare the latest record before retrying." });
      } else {
        setPanelFeedback({ kind: "error", message: safeApiMessage(error, "The Action could not be updated. Your draft is preserved.") });
      }
      if (error instanceof ApiError) setFieldErrors(Object.fromEntries(error.details.map((issue) => [issue.field, issue.message])));
    } finally {
      if (operationScope.current === scope) setEditBusy(false);
    }
  }

  function openTransition(action: TicketAction, status: ActionTransition, trigger: HTMLButtonElement) {
    if (stale || !action.permissions?.allowedTransitions.includes(status) || action.workCycle !== currentCycle || !isWritableParent) return;
    if (transitionDraft?.actionId === action.id && transitionDraft.status === status) return;
    focusReturnTarget.current = trigger;
    if (transitionIntents.current.has(action.id)) transitionIntents.current.delete(action.id);
    setTransitionDraft({
      actionId: action.id,
      expectedTicketVersion: currentTicketVersion,
      expectedActionVersion: action.version ?? 1,
      status,
      result: action.result ?? "",
      actionAt: toBangkokDateTimeLocal(action.actionAt),
      actionAtTouched: false,
      followUpRequired: action.followUpRequired,
      followUpNote: action.followUpNote ?? "",
      cancelReason: "",
    });
    setExpandedActionId(action.id);
    setPanelFeedback(null);
    setFieldErrors({});
  }

  function closeTransition() {
    setTransitionDraft(null);
    setFieldErrors({});
    returnFocusToTrigger();
  }

  async function submitTransition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transitionDraft || stale || transitionBusy) return;
    const action = actionsPage?.data.find((candidate) => candidate.id === transitionDraft.actionId) ?? linkedAction;
    if (!action) return;
    if (!isWritableParent || action.workCycle !== currentCycle) {
      setPanelFeedback({ kind: "warning", message: "This Ticket or Action is now read-only. Your transition draft is preserved; reopen the Ticket or start a new work cycle before changing it." });
      return;
    }
    const errors: Record<string, string> = {};
    if (transitionDraft.status === "COMPLETED") {
      if (!transitionDraft.result.trim()) errors.result = "Enter a Result before completing this Action.";
      if (transitionDraft.actionAtTouched) {
        const dateError = actionDateError(transitionDraft.actionAt, ticket, serverNow());
        if (dateError) errors.actionAt = dateError;
      }
      if (transitionDraft.followUpRequired && !transitionDraft.followUpNote.trim()) errors.followUpNote = "Enter a Follow-up Note when follow-up is required.";
    }
    if (transitionDraft.status === "CANCELLED" && !transitionDraft.cancelReason.trim()) errors.cancelReason = "Enter a cancellation reason.";
    if (transitionDraft.cancelReason.length > 1000) errors.cancelReason = "Cancellation reason must be 1,000 characters or fewer.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      focusFirstInvalid("transition", Object.keys(errors)[0], transitionDraft.actionId);
      return;
    }
    const approved = conflict?.scope === "transition" && conflict.actionId === action.id && conflict.reviewed;
    let body: ActionTransitionInput;
    if (transitionDraft.status === "IN_PROGRESS") {
      body = { expectedTicketVersion: approved ? conflict.latestTicketVersion! : transitionDraft.expectedTicketVersion, expectedActionVersion: approved ? conflict.latestActionVersion! : transitionDraft.expectedActionVersion, status: "IN_PROGRESS" };
    } else if (transitionDraft.status === "COMPLETED") {
      body = {
        expectedTicketVersion: approved ? conflict.latestTicketVersion! : transitionDraft.expectedTicketVersion,
        expectedActionVersion: approved ? conflict.latestActionVersion! : transitionDraft.expectedActionVersion,
        status: "COMPLETED",
        result: transitionDraft.result.trim(),
        ...(transitionDraft.actionAtTouched && fromBangkokDateTimeLocal(transitionDraft.actionAt) ? { actionAt: fromBangkokDateTimeLocal(transitionDraft.actionAt)! } : {}),
        followUpRequired: transitionDraft.followUpRequired,
        ...(blankToUndefined(transitionDraft.followUpNote) ? { followUpNote: blankToUndefined(transitionDraft.followUpNote)! } : { followUpNote: "" }),
      };
    } else {
      body = { expectedTicketVersion: approved ? conflict.latestTicketVersion! : transitionDraft.expectedTicketVersion, expectedActionVersion: approved ? conflict.latestActionVersion! : transitionDraft.expectedActionVersion, status: "CANCELLED", cancelReason: transitionDraft.cancelReason.trim() };
    }
    let intent = transitionIntents.current.get(action.id);
    if (!intent) {
      intent = { key: crypto.randomUUID(), body };
      transitionIntents.current.set(action.id, intent);
    }
    const scope = operationScope.current;
    setTransitionBusy(true);
    setPanelFeedback(null);
    try {
      const result = await transitionStaffAction(ticket.id, action.id, intent.body as ActionTransitionInput, intent.key);
      if (operationScope.current !== scope) return;
      transitionIntents.current.delete(action.id);
      setTransitionDraft(null);
      setConflict(null);
      setPanelFeedback({ kind: "success", message: `Action ${result.action.id} is now ${ACTION_STATUS_LABEL[result.action.status]}.` });
      setFocusedActionId(result.action.id);
      await refreshAll();
    } catch (error) {
      if (operationScope.current !== scope) return;
      const ambiguous = !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
      if (!ambiguous) transitionIntents.current.delete(action.id);
      if (error instanceof ApiError && error.status === 409) {
        setConflict({ scope: "transition", actionId: action.id, ticketVersion: body.expectedTicketVersion, actionVersion: body.expectedActionVersion, reviewed: false });
        setPanelFeedback({ kind: "warning", message: "Ticket or Action changed before this transition. Your submitted values are preserved; load and compare the latest record before retrying." });
      } else {
        setPanelFeedback({ kind: "error", message: ambiguous ? "The result is unknown. Retry this exact transition, or edit a field to start a new intent." : safeApiMessage(error, "The Action transition failed. Your values are preserved.") });
      }
      if (error instanceof ApiError) setFieldErrors(Object.fromEntries(error.details.map((issue) => [issue.field, issue.message])));
    } finally {
      if (operationScope.current === scope) setTransitionBusy(false);
    }
  }

  async function reloadConflictForReview() {
    if (!conflict) return;
    if (!refreshParentRef.current) {
      setPanelFeedback({ kind: "error", message: "The latest Ticket cannot be reloaded from this view." });
      return;
    }
    const scope = operationScope.current;
    const ticketId = ticket.id;
    const currentConflict = conflict;
    setRefreshing(true);
    try {
      const latest = await refreshParentRef.current();
      if (operationScope.current !== scope) return;
      let action: TicketAction | undefined;
      if (currentConflict.actionId) action = (await fetchStaffAction(ticketId, currentConflict.actionId)).action;
      if (operationScope.current !== scope) return;
      setConflict((current) => current ? {
        ...current,
        latestTicketVersion: latest.version ?? currentTicketVersion,
        latestActionVersion: action?.version,
        latestStatus: action?.status,
        reviewed: false,
      } : null);
      const [nextActions, nextWorkflow] = await Promise.all([
        fetchStaffActions(ticketId, page, pageSize),
        fetchStaffWorkflow(ticketId, workflowPage, 10),
      ]);
      if (operationScope.current !== scope) return;
      setActionsPage(nextActions);
      setWorkflow(nextWorkflow);
      setStale(false);
      setLoadState("ready");
      setWorkflowState("ready");
      setPanelFeedback({ kind: "warning", message: "Latest versions are loaded for comparison. Your draft is unchanged; explicitly confirm after reviewing before retrying." });
    } catch {
      if (operationScope.current !== scope) return;
      setStale(true);
      setPanelFeedback({ kind: "error", message: "The latest Ticket and Action could not be loaded. Your draft is preserved and writes stay paused." });
    } finally {
      if (operationScope.current === scope) setRefreshing(false);
    }
  }

  function authorizeConflictRetry() {
    if (!conflict?.latestTicketVersion) return;
    setConflict((current) => current ? { ...current, reviewed: true } : null);
    setPanelFeedback({ kind: "warning", message: "You confirmed the latest versions. Review the draft once more, then submit it as a new intent." });
  }

  function changeHistoryPage(actionId: number, nextPage: number) {
    setHistoryPages((pages) => ({ ...pages, [actionId]: nextPage }));
    setHistoryActionId(actionId);
  }

  function linkedOrCurrentActions(): TicketAction[] {
    const rows = actionsPage?.data ?? [];
    if (linkedAction && !rows.some((action) => action.id === linkedAction.id)) return [linkedAction, ...rows];
    return rows;
  }

  const rows = linkedOrCurrentActions();

  if (viewScope !== operationScope.current) {
    return <div className="zen-card action-taken-panel p-3 p-md-4" aria-labelledby="actions-taken-heading" data-testid="actions-taken-panel">
      <h2 id="actions-taken-heading" className="h4">Actions Taken</h2>
      <p className="zen-muted" role="status" aria-busy="true">Loading Actions for the current Ticket and account…</p>
    </div>;
  }

  return (
    <div className="zen-card action-taken-panel p-3 p-md-4" aria-labelledby="actions-taken-heading" data-testid="actions-taken-panel">
      <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-start gap-3 mb-3">
        <div>
          <h2 id="actions-taken-heading" className="h4 mb-1">Actions Taken</h2>
          <p className="zen-muted mb-0">
            {actionsPage ? `${actionsPage.total} Action${actionsPage.total === 1 ? "" : "s"}` : "All Action history"} · Current work cycle {currentCycle}
          </p>
        </div>
        {isStaff && <button ref={newActionButton} type="button" className="btn btn-primary" onClick={openCreate} disabled={!isWritableParent || stale || editorBusy || ownerState !== "ready"}>
          New Action
        </button>}
      </div>

      {!isWritableParent && <p className="zen-warning-panel" role="status">
        {ticket.currentStatus === "RESOLVED" ? "Reopen this Ticket to add or correct work." : "Closed/Cancelled Tickets are read-only."} Existing Actions and history remain available.
      </p>}
      {panelFeedback && <p className={`zen-${panelFeedback.kind === "success" ? "success" : panelFeedback.kind === "warning" ? "warning-panel" : "field-error"}`} role={panelFeedback.kind === "error" ? "alert" : "status"} aria-live="polite">{panelFeedback.message}</p>}
      {stale && <div className="zen-warning-panel mb-3" role="alert">
        <p className="mb-2">Ticket details, Actions, or workflow may be stale. Writes are paused until all views refresh.</p>
        <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => void refreshAll()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh Ticket and history"}</button>
      </div>}
      {linkedActionError && <p className="zen-field-error" role="alert">{linkedActionError}</p>}
      {ownerState === "error" && isStaff && <div className="zen-warning-panel mb-3" role="alert"><p className="mb-2">Eligible assignees could not be loaded. Creating or reassigning Actions is paused.</p><button type="button" className="btn btn-outline-primary btn-sm" onClick={retryOwners}>Retry assignee list</button></div>}

      {conflict && <div className="zen-warning-panel mb-3" role="group" aria-label="Review latest Action versions">
        <p className="fw-semibold mb-1">Review the latest versions before retrying.</p>
        <p className="mb-2">Your draft has not been replaced. Submitted Ticket version: {conflict.ticketVersion}{conflict.actionVersion ? `; Action version: ${conflict.actionVersion}` : ""}.</p>
        {conflict.latestTicketVersion === undefined ? <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => void reloadConflictForReview()} disabled={refreshing}>{refreshing ? "Loading…" : "Load latest for comparison"}</button> : <>
          <p className="mb-2">Latest Ticket version: {conflict.latestTicketVersion}{conflict.latestActionVersion !== undefined ? `; Action version: ${conflict.latestActionVersion} (${ACTION_STATUS_LABEL[conflict.latestStatus ?? "PLANNED"]})` : ""}.</p>
          {!conflict.reviewed ? <button type="button" className="btn btn-outline-primary btn-sm" onClick={authorizeConflictRetry}>I reviewed these versions; allow explicit retry</button> : <p className="mb-0" role="status">Versions approved for this draft. Review all values and submit explicitly.</p>}
        </>}
      </div>}

      {createOpen && <section className="action-editor zen-action-editor mb-4" aria-labelledby="new-action-heading">
        <h3 id="new-action-heading" className="h5">New Planned Action</h3>
        {!isWritableParent && <p className="zen-warning-panel" role="status">This Ticket became read-only. Your draft is preserved, but it cannot be saved.</p>}
        {createDraft.assigneeId && owners.some((owner) => String(owner.id) === createDraft.assigneeId) ? null : <p className="zen-muted">The default assignee is your account. Choose an active IT Staff member or Administrator if needed.</p>}
        <form onSubmit={(event) => void submitCreate(event)} noValidate aria-busy={createBusy}>
            <ActionDraftFields draft={createDraft} onChange={(patch) => { draftChanged("create"); setCreateDraft((current) => ({ ...current, ...patch })); }} ticket={ticket} owners={owners} mode="create" terminal={false} resultRequired={false} errors={fieldErrors} busy={createBusy || createControlsBusy} />
          <div className="d-flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={createBusy || stale || !isWritableParent || createControlsBusy || ownerState !== "ready" || (conflict?.scope === "create" && !conflict.reviewed)}>{createBusy ? "Saving…" : createIntent.current ? "Retry exact create" : "Save Planned Action"}</button>
            <button type="button" className="btn btn-outline-primary" disabled={editorBusy} onClick={requestCloseCreate}>Cancel</button>
          </div>
        </form>
        {discardCreateConfirm && <div className="zen-warning-panel mt-3" role="alertdialog" aria-labelledby="discard-action-heading">
          <h4 id="discard-action-heading" className="h6">Discard this Action draft?</h4>
          <p>Unsaved field values will be cleared.</p>
          <div className="d-flex flex-wrap gap-2"><button id="keep-create-action-editing" type="button" className="btn btn-outline-primary" onClick={() => { setDiscardCreateConfirm(false); returnFocusToTrigger(); }}>Keep editing</button><button type="button" className="btn btn-danger" onClick={() => { setCreateDraft(emptyDraft(ticket, user?.id ?? 0, currentTicketVersion)); setCreateOpen(false); setDiscardCreateConfirm(false); setFieldErrors({}); requestAnimationFrame(() => newActionButton.current?.focus()); }}>Discard draft</button></div>
        </div>}
      </section>}

      {loadState === "loading" && !actionsPage ? <p className="zen-muted" role="status" aria-busy="true">Loading Actions…</p> : null}
      {loadState === "error" && !actionsPage ? <p className="zen-field-error" role="alert">Actions could not be loaded. Refresh to retry.</p> : null}
      {loadState === "ready" && actionsPage?.total === 0 && <p className="zen-muted" role="status">No Actions have been recorded for this Ticket.</p>}
      {actionsPage && actionsPage.total > 0 && <>
        <div className="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-2">
          <p className="zen-muted mb-0">Actions are shown oldest first. Earlier-cycle Actions are retained as read-only history.</p>
          <label className="form-label mb-0">Actions per page
            <select className="form-select form-select-sm d-inline-block ms-2" style={{ width: "auto" }} aria-label="Actions per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]); setPage(1); }}>
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        </div>
        <div className="action-table-wrap d-none d-lg-block">
          <table className="table align-middle action-table">
            <thead><tr><th scope="col">Cycle</th><th scope="col">Action Date/Time</th><th scope="col">Description</th><th scope="col">Status</th><th scope="col">Assignee</th><th scope="col">Performed by</th><th scope="col">Follow-up</th><th scope="col">Details</th></tr></thead>
            <tbody>{rows.map((action) => <tr key={action.id} data-testid={`action-row-${action.id}`} className={action.workCycle !== currentCycle ? "is-historical" : ""}>
              <td><span className="zen-badge">Cycle {action.workCycle}{action.workCycle !== currentCycle ? " · Historical" : ""}</span></td>
              <td><time dateTime={action.actionAt}>{formatDate(action.actionAt)}</time></td>
              <td className="action-long-text">{action.description}</td>
              <td>{statusBadge(action.status)}</td>
              <td>{action.assignee.fullName}{action.assigneeEligible === false && action.status !== "COMPLETED" && action.status !== "CANCELLED" ? <span className="d-block zen-field-error">Inactive or ineligible; reassign before Start/Complete.</span> : null}</td>
              <td>{action.performedBy?.fullName ?? "Not completed"}</td>
              <td>{action.followUpRequired ? "Required" : "No"}</td>
              <td><button type="button" className="btn btn-outline-primary btn-sm" disabled={editorBusy} aria-expanded={expandedActionId === action.id} onClick={() => { setExpandedActionId(expandedActionId === action.id ? null : action.id); setEditAction(null); setTransitionDraft(null); }}>{expandedActionId === action.id ? "Hide details" : "View details"}</button></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="action-card-list d-lg-none">
          {rows.map((action) => <article className={`action-card${action.workCycle !== currentCycle ? " is-historical" : ""}`} key={action.id}>
            <h3 className="h6" tabIndex={-1} ref={(element) => { if (element) actionHeadings.current.set(action.id, element); else actionHeadings.current.delete(action.id); }}>Action {action.id} · Cycle {action.workCycle}{action.workCycle !== currentCycle ? " · Historical" : ""}</h3>
            <p className="mb-2">{statusBadge(action.status)}</p>
            <dl className="action-card-fields"><dt>Action Date/Time</dt><dd>{formatDate(action.actionAt)}</dd><dt>Description</dt><dd>{action.description}</dd><dt>Assignee</dt><dd>{action.assignee.fullName}</dd><dt>Performed by</dt><dd>{action.performedBy?.fullName ?? "Not completed"}</dd><dt>Follow-up</dt><dd>{action.followUpRequired ? "Required" : "No"}</dd></dl>
            {action.assigneeEligible === false && action.status !== "COMPLETED" && action.status !== "CANCELLED" && <p className="zen-warning-panel">This assignee is inactive or ineligible. Reassign before Start or Complete.</p>}
            <button type="button" className="btn btn-outline-primary btn-sm" disabled={editorBusy} aria-expanded={expandedActionId === action.id} onClick={() => setExpandedActionId(expandedActionId === action.id ? null : action.id)}>{expandedActionId === action.id ? "Hide details" : "View details"}</button>
          </article>)}
        </div>
        <Pagination page={page} pageSize={pageSize} total={actionsPage.total} totalPages={actionsPage.totalPages} onPageChange={setPage} itemLabel="Actions" />

        {rows.map((action) => expandedActionId === action.id ? <section className="action-expanded zen-action-expanded mt-3" key={`detail-${action.id}`} aria-labelledby={`action-detail-heading-${action.id}`}>
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
            <h3 id={`action-detail-heading-${action.id}`} className="h5" tabIndex={-1} ref={(element) => { if (element) actionHeadings.current.set(action.id, element); else actionHeadings.current.delete(action.id); }}>Action {action.id} · {ACTION_STATUS_LABEL[action.status]}</h3>
            <div className="d-flex flex-wrap gap-2">
              {isStaff && action.permissions?.canEdit && action.workCycle === currentCycle && isWritableParent && <button type="button" className="btn btn-outline-primary btn-sm" disabled={editorBusy} onClick={(event) => openEdit(action, event.currentTarget)}>Edit Action</button>}
              {isStaff && action.permissions?.canEdit && action.workCycle === currentCycle && isWritableParent && action.permissions.allowedTransitions.map((status) => <button key={status} type="button" className={`btn btn-sm ${status === "CANCELLED" ? "btn-outline-danger" : "btn-outline-primary"}`} disabled={editorBusy} onClick={(event) => openTransition(action, status, event.currentTarget)}>{status === "IN_PROGRESS" ? "Start" : status === "COMPLETED" ? "Complete" : "Cancel Action"}</button>)}
              {isStaff && <button type="button" className="btn btn-outline-primary btn-sm" aria-expanded={historyActionId === action.id} onClick={() => setHistoryActionId(historyActionId === action.id ? null : action.id)}>{historyActionId === action.id ? "Hide history" : "View change history"}</button>}
            </div>
          </div>
          {action.workCycle !== currentCycle && <p className="zen-warning-panel">This Action belongs to an earlier work cycle and is historical, read-only history.</p>}
          {(ticket.currentStatus === "RESOLVED" || ticket.currentStatus === "CLOSED" || ticket.currentStatus === "CANCELLED") && <p className="zen-warning-panel">{ticket.currentStatus === "RESOLVED" ? "Reopen this Ticket to add or correct work." : "This Ticket is final and read-only."}</p>}
          {action.assigneeEligible === false && action.status !== "COMPLETED" && action.status !== "CANCELLED" && <p className="zen-warning-panel">{action.assignee.fullName} is no longer an active eligible assignee. Reassign this Action before Start or Complete.</p>}
          <dl className="action-detail-grid">
            <dt>Action Date/Time</dt><dd>{formatDate(action.actionAt)}</dd>
            <dt>Created by / Created At</dt><dd>{action.createdBy.fullName} · {formatDate(action.createdAt)}</dd>
            <dt>Completed At</dt><dd>{formatDate(action.completedAt)}</dd>
            <dt>Cancelled At</dt><dd>{formatDate(action.cancelledAt)}</dd>
            <dt>Cancelled by</dt><dd>{action.cancelledBy?.fullName ?? "—"}</dd>
            <dt>Result</dt><dd>{action.result || "—"}</dd>
            <dt>Follow-up Required</dt><dd>{action.followUpRequired ? "Yes" : "No"}</dd>
            <dt>Follow-up Note</dt><dd className="action-long-text">{action.followUpNote || "—"}</dd>
            <dt>Attachment Notes</dt><dd className="action-long-text">{action.attachmentNotes || "—"}</dd>
            {action.cancelReason && <><dt>Cancellation Reason</dt><dd className="action-long-text">{action.cancelReason}</dd></>}
          </dl>
          {editAction?.id === action.id && editDraft && <form className="action-editor mt-3" onSubmit={(event) => void submitEdit(event)} noValidate aria-busy={editBusy}>
            <h4 className="h6">{action.status === "COMPLETED" || action.status === "CANCELLED" ? "Correct terminal Action" : "Edit Action"}</h4>
            {(!isWritableParent || action.workCycle !== currentCycle) && <p className="zen-warning-panel" role="status">This Ticket or Action became read-only. Your edit draft is preserved, but cannot be saved.</p>}
            {action.status === "COMPLETED" || action.status === "CANCELLED" ? <p className="zen-muted">Status, assignee, creator, performer, and server timestamps are read-only.</p> : null}
            <ActionDraftFields draft={editDraft} onChange={(patch) => { draftChanged("edit", action.id); setEditDraft((current) => current ? { ...current, ...patch } : current); }} ticket={ticket} owners={owners} mode="edit" terminal={action.status === "COMPLETED" || action.status === "CANCELLED"} terminalAssigneeName={action.assignee.fullName} resultRequired={action.status === "COMPLETED"} errors={fieldErrors} busy={editBusy || editControlsBusy} />
            <div className="d-flex flex-wrap gap-2"><button type="submit" className="btn btn-primary" disabled={editBusy || editControlsBusy || stale || !isWritableParent || action.workCycle !== currentCycle || (conflict?.scope === "edit" && conflict.actionId === action.id && !conflict.reviewed)}>{editBusy ? "Saving…" : "Save revision"}</button><button type="button" className="btn btn-outline-primary" disabled={editorBusy} onClick={closeEdit}>Discard changes</button></div>
          </form>}
          {transitionDraft?.actionId === action.id && <form className="action-editor mt-3" onSubmit={(event) => void submitTransition(event)} noValidate aria-busy={transitionBusy}>
            <h4 className="h6">{transitionDraft.status === "IN_PROGRESS" ? "Start Action" : transitionDraft.status === "COMPLETED" ? "Complete Action" : "Cancel Action"}</h4>
            {(!isWritableParent || action.workCycle !== currentCycle) && <p className="zen-warning-panel" role="status">This Ticket or Action became read-only. Your transition draft is preserved, but cannot be saved.</p>}
            {transitionDraft.status === "IN_PROGRESS" && <p className="zen-muted">{action.assignee.fullName} is the assigned person. The authenticated user will be recorded as the person who performed the completion.</p>}
            {transitionDraft.status === "COMPLETED" && <>
              <p className="zen-muted">Assigned to {action.assignee.fullName}; the authenticated user will be recorded as the performer.</p>
              <FormField id={`transition-result-${action.id}`} label="Result" required error={fieldErrors.result}>{({ id, describedBy, invalid }) => <textarea id={id} className={`form-control${invalid ? " is-invalid" : ""}`} rows={3} maxLength={2000} value={transitionDraft.result} onChange={(event) => { draftChanged("transition", action.id); setTransitionDraft((current) => current ? { ...current, result: event.target.value } : current); }} aria-describedby={describedBy} aria-invalid={invalid} disabled={transitionBusy || transitionControlsBusy} />}</FormField>
              <FormField id={`transition-action-at-${action.id}`} label="Action Date/Time (Bangkok)" required error={fieldErrors.actionAt}>{({ id, describedBy, invalid }) => <input id={id} className={`form-control${invalid ? " is-invalid" : ""}`} type="datetime-local" value={transitionDraft.actionAt} onChange={(event) => { draftChanged("transition", action.id); setTransitionDraft((current) => current ? { ...current, actionAt: event.target.value, actionAtTouched: true } : current); }} aria-describedby={describedBy} aria-invalid={invalid} disabled={transitionBusy || transitionControlsBusy} />}</FormField>
              <label className="form-check-label d-flex align-items-center gap-2 mb-2" htmlFor={`transition-follow-up-${action.id}`}><input id={`transition-follow-up-${action.id}`} className="form-check-input mt-0" type="checkbox" checked={transitionDraft.followUpRequired} onChange={(event) => { draftChanged("transition", action.id); setTransitionDraft((current) => current ? { ...current, followUpRequired: event.target.checked } : current); }} disabled={transitionBusy || transitionControlsBusy} />Follow-up Required?</label>
              <FormField id={`transition-follow-up-note-${action.id}`} label="Follow-up Note" required={transitionDraft.followUpRequired} error={fieldErrors.followUpNote}>{({ id, describedBy, invalid }) => <textarea id={id} className={`form-control${invalid ? " is-invalid" : ""}`} rows={2} maxLength={2000} value={transitionDraft.followUpNote} onChange={(event) => { draftChanged("transition", action.id); setTransitionDraft((current) => current ? { ...current, followUpNote: event.target.value } : current); }} aria-describedby={describedBy} aria-invalid={invalid} disabled={transitionBusy || transitionControlsBusy} />}</FormField>
            </>}
            {transitionDraft.status === "CANCELLED" && <>
              <p className="zen-warning-panel">Confirm that Action {action.id} ({action.description}) should be cancelled. This does not cancel the Ticket.</p>
              <FormField id={`transition-cancel-reason-${action.id}`} label="Cancellation Reason" required error={fieldErrors.cancelReason}>{({ id, describedBy, invalid }) => <textarea id={id} className={`form-control${invalid ? " is-invalid" : ""}`} rows={3} maxLength={1000} value={transitionDraft.cancelReason} onChange={(event) => { draftChanged("transition", action.id); setTransitionDraft((current) => current ? { ...current, cancelReason: event.target.value } : current); }} aria-describedby={describedBy} aria-invalid={invalid} disabled={transitionBusy || transitionControlsBusy} />}</FormField>
            </>}
            <div className="d-flex flex-wrap gap-2"><button type="submit" className={`btn ${transitionDraft.status === "CANCELLED" ? "btn-danger" : "btn-primary"}`} disabled={transitionBusy || transitionControlsBusy || stale || !isWritableParent || action.workCycle !== currentCycle || (conflict?.scope === "transition" && conflict.actionId === action.id && !conflict.reviewed)}>{transitionBusy ? "Saving…" : transitionIntents.current.has(action.id) ? "Retry exact transition" : transitionDraft.status === "IN_PROGRESS" ? "Confirm Start" : transitionDraft.status === "COMPLETED" ? "Confirm Complete" : "Confirm Cancel Action"}</button><button type="button" className="btn btn-outline-primary" disabled={editorBusy || transitionIntents.current.has(action.id)} onClick={closeTransition}>Cancel form</button></div>
          </form>}
          {historyActionId === action.id && <ActionHistory ticketId={ticket.id} action={action} data={histories[action.id]} onPageChange={(nextPage) => changeHistoryPage(action.id, nextPage)} />}
        </section> : null)}
      </>}

      <section className="action-workflow mt-4" aria-labelledby="public-workflow-heading">
        <h3 id="public-workflow-heading" className="h5">Ticket status history</h3>
        <p className="zen-muted">Public Ticket status events are separate from Action change history.</p>
        {workflowState === "loading" && !workflow && <p className="zen-muted" role="status">Loading status history…</p>}
        {workflowState === "error" && <p className="zen-field-error" role="alert">Ticket status history could not be loaded.</p>}
        {workflow?.data.length === 0 && <p className="zen-muted">No status history is available.</p>}
        {workflow && workflow.data.length > 0 && <>
          <ol className="action-workflow-list">
            {workflow.data.map((event) => <li key={event.id}>
              <div className="d-flex flex-wrap justify-content-between gap-2"><strong>{event.kind === "BASELINE" ? "Status at Lab 4 migration" : event.kind === "CREATED" ? "Ticket created" : `${statusTitle(event.fromStatus ?? "")} → ${statusTitle(event.toStatus)}`}</strong><time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time></div>
              <p className="mb-1">Cycle {event.workCycle} · {publicActorLabel(event)}</p>
              {event.label && <p className="zen-muted mb-1">{event.label}</p>}
              {event.reason && <p className="mb-0">Reason: {event.reason}</p>}
            </li>)}
          </ol>
          <Pagination page={workflow.page} pageSize={workflow.pageSize} total={workflow.total} totalPages={workflow.totalPages} onPageChange={setWorkflowPage} itemLabel="status events" />
        </>}
      </section>
    </div>
  );
}

function ActionHistory({
  ticketId,
  action,
  data,
  onPageChange,
}: {
  ticketId: number;
  action: TicketAction;
  data?: { data: ActionRevision[]; page: number; pageSize: number; total: number; totalPages: number };
  onPageChange: (page: number) => void;
}) {
  if (!data) return <p className="zen-muted mt-3" role="status" aria-busy="true">Loading Action history…</p>;
  const people = new Map<number, string>([
    [action.assignee.id, action.assignee.fullName],
    [action.createdBy.id, action.createdBy.fullName],
    ...(action.performedBy ? [[action.performedBy.id, action.performedBy.fullName] as [number, string]] : []),
    ...(action.cancelledBy ? [[action.cancelledBy.id, action.cancelledBy.fullName] as [number, string]] : []),
    ...data.data.map((revision) => [revision.actor.id, revision.actor.fullName] as [number, string]),
  ]);
  return <section className="action-history mt-3" aria-labelledby={`action-history-heading-${action.id}`}>
    <h4 id={`action-history-heading-${action.id}`} className="h6">Change history for Action {action.id}</h4>
    <ol className="action-revision-list">
      {data.data.map((revision) => <li key={revision.id}>
        <div className="d-flex flex-wrap justify-content-between gap-2"><strong>#{revision.sequence} · {statusTitle(revision.operation)}</strong><time dateTime={revision.occurredAt}>{formatDate(revision.occurredAt)}</time></div>
        <p className="mb-1">Changed by {revision.actor.fullName}{revision.reason ? ` · Reason: ${revision.reason}` : ""}</p>
        {revision.before && revision.after ? <ul className="action-diff-list">{changedFields(revision, people).map((change) => <li key={change.label}><strong>{change.label}:</strong> {change.before} <span aria-hidden="true">→</span> {change.after}</li>)}</ul> : <p className="zen-muted mb-0">Action created.</p>}
      </li>)}
    </ol>
    {data.totalPages > 1 && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} totalPages={data.totalPages} onPageChange={onPageChange} itemLabel="history entries" />}
    <span className="visually-hidden">Ticket {ticketId} Action history.</span>
  </section>;
}
