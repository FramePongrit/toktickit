import { Prisma, type TicketStatus } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { HttpError } from "../lib/httpError.js";
import {
  ACTION_TRANSITIONS,
  ACTION_WRITABLE_TICKET_STATUSES,
  actionDateIsWithinTicket,
  allowedActionTransitions,
} from "../lib/actionRules.js";
import {
  actionCreateSchema,
  actionListQuerySchema,
  actionPatchSchema,
  actionTransitionSchema,
  type ActionCreateInput,
  type ActionListQuery,
  type ActionPatchInput,
  type ActionTransitionInput,
} from "../lib/validation.js";
import {
  digestRequestBody,
  lockAndReadIdempotencyRecord,
  replayIdempotencyRecord,
  requireIdempotencyKey,
  saveIdempotencySuccess,
  type IdempotencyScope,
} from "../lib/idempotency.js";
import {
  assertCurrentStaffSession,
  lockUsersInIdOrder,
  type LockedOperationalUser,
  type TransactionClient,
} from "./operationalLocks.js";

const STAFF_ACTION_INCLUDE = {
  assignee: { select: { id: true, fullName: true, role: true, active: true } },
  createdBy: { select: { id: true, fullName: true } },
  performedBy: { select: { id: true, fullName: true } },
  cancelledBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ActionTakenInclude;

type StaffAction = Prisma.ActionTakenGetPayload<{ include: typeof STAFF_ACTION_INCLUDE }>;

interface ActionParent {
  id: number;
  currentStatus: TicketStatus;
  workCycle: number;
  version: number;
  createdAt: Date;
}

interface ActionRequestActor {
  userId: number;
  sessionId: string;
}

interface IdempotentWriteResult {
  status: number;
  body: unknown;
  replayed: boolean;
}

class AssigneeSnapshotChanged extends Error {
  constructor(readonly assigneeId: number) {
    super("Action assignee changed while acquiring ordered User locks.");
  }
}

export type ActionLockTestHook = (context: {
  ticketId: number;
  operation: string;
  backendPid: number;
  userIds?: number[];
}) => void | Promise<void>;

let actionLockTestHook: ActionLockTestHook | undefined;

export function setActionLockTestHook(hook: ActionLockTestHook | undefined): void {
  actionLockTestHook = hook;
}

async function notifyActionLockTestHook(
  tx: TransactionClient,
  ticketId: number,
  operation: string,
  userIds?: number[]
): Promise<void> {
  if (!actionLockTestHook) return;
  const [{ backendPid }] = await tx.$queryRaw<{ backendPid: number }[]>`
    SELECT pg_backend_pid() AS "backendPid"
  `;
  await actionLockTestHook({ ticketId, operation, backendPid, userIds });
}

function personRef(person: { id: number; fullName: string } | null) {
  return person ? { id: person.id, fullName: person.fullName } : null;
}

function assigneeEligible(user: { role: string; active: boolean }): boolean {
  return user.active && (user.role === "STAFF" || user.role === "ADMIN");
}

function serializeStaffAction(action: StaffAction, parent: ActionParent) {
  const eligible = assigneeEligible(action.assignee);
  const writable = ACTION_WRITABLE_TICKET_STATUSES.has(parent.currentStatus) && action.workCycle === parent.workCycle;
  return {
    id: action.id,
    ticketId: action.ticketId,
    workCycle: action.workCycle,
    status: action.status,
    description: action.description,
    result: action.result,
    actionAt: action.actionAt,
    assignee: personRef(action.assignee),
    assigneeEligible: eligible,
    createdBy: personRef(action.createdBy),
    performedBy: personRef(action.performedBy),
    followUpRequired: action.followUpRequired,
    followUpNote: action.followUpNote,
    attachmentNotes: action.attachmentNotes,
    version: action.version,
    createdAt: action.createdAt,
    updatedAt: action.updatedAt,
    completedAt: action.completedAt,
    cancelledAt: action.cancelledAt,
    cancelledBy: personRef(action.cancelledBy),
    cancelReason: action.cancelReason,
    permissions: {
      canEdit: writable,
      allowedTransitions: allowedActionTransitions(action.status, eligible, writable),
    },
  };
}

function serializeRequesterAction(action: StaffAction) {
  return {
    id: action.id,
    ticketId: action.ticketId,
    workCycle: action.workCycle,
    status: action.status,
    description: action.description,
    result: action.result,
    actionAt: action.actionAt,
    assignee: personRef(action.assignee),
    createdBy: personRef(action.createdBy),
    performedBy: personRef(action.performedBy),
    followUpRequired: action.followUpRequired,
    followUpNote: action.followUpNote,
    attachmentNotes: action.attachmentNotes,
    createdAt: action.createdAt,
    updatedAt: action.updatedAt,
    completedAt: action.completedAt,
    cancelledAt: action.cancelledAt,
    cancelledBy: personRef(action.cancelledBy),
    cancelReason: action.cancelReason,
  };
}

function pageResult<T>(rows: T[], query: ActionListQuery, total: number) {
  return {
    data: rows,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}

async function findStaffParent(ticketId: number): Promise<ActionParent> {
  const ticket = await getPrisma().ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, currentStatus: true, workCycle: true, version: true, createdAt: true },
  });
  if (!ticket) throw HttpError.notFound("TICKET_NOT_FOUND", "The requested Ticket does not exist.");
  return ticket;
}

async function findRequesterParent(userId: number, ticketId: number): Promise<ActionParent> {
  const ticket = await getPrisma().ticket.findFirst({
    where: { id: ticketId, requesterId: userId },
    select: { id: true, currentStatus: true, workCycle: true, version: true, createdAt: true },
  });
  if (!ticket) throw HttpError.notFound("TICKET_NOT_FOUND", "The requested Ticket does not exist.");
  return ticket;
}

export async function listStaffActions(ticketId: number, rawQuery: unknown) {
  const query = actionListQuerySchema.parse(rawQuery);
  const parent = await findStaffParent(ticketId);
  const prisma = getPrisma();
  const where = { ticketId };
  const [rows, total] = await prisma.$transaction([
    prisma.actionTaken.findMany({
      where,
      include: STAFF_ACTION_INCLUDE,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.actionTaken.count({ where }),
  ]);
  return { ...pageResult(rows.map((row) => serializeStaffAction(row, parent)), query, total), ticketVersion: parent.version, workCycle: parent.workCycle };
}

export async function getStaffAction(ticketId: number, actionId: number) {
  const parent = await findStaffParent(ticketId);
  const action = await getPrisma().actionTaken.findFirst({
    where: { id: actionId, ticketId },
    include: STAFF_ACTION_INCLUDE,
  });
  if (!action) throw HttpError.notFound("ACTION_NOT_FOUND", "The requested Action does not exist.");
  return { action: serializeStaffAction(action, parent), ticketVersion: parent.version };
}

export async function listRequesterActions(userId: number, ticketId: number, rawQuery: unknown) {
  const query = actionListQuerySchema.parse(rawQuery);
  await findRequesterParent(userId, ticketId);
  const prisma = getPrisma();
  const where = { ticketId };
  const [rows, total] = await prisma.$transaction([
    prisma.actionTaken.findMany({
      where,
      include: STAFF_ACTION_INCLUDE,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.actionTaken.count({ where }),
  ]);
  return pageResult(rows.map(serializeRequesterAction), query, total);
}

export async function listStaffActionHistory(ticketId: number, actionId: number, rawQuery: unknown) {
  const query = actionListQuerySchema.parse(rawQuery);
  await findStaffParent(ticketId);
  const action = await getPrisma().actionTaken.findFirst({ where: { id: actionId, ticketId }, select: { id: true } });
  if (!action) throw HttpError.notFound("ACTION_NOT_FOUND", "The requested Action does not exist.");
  const prisma = getPrisma();
  const where = { actionId };
  const [rows, total] = await prisma.$transaction([
    prisma.actionRevision.findMany({
      where,
      include: { actor: { select: { id: true, fullName: true } } },
      orderBy: [{ sequence: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.actionRevision.count({ where }),
  ]);
  return pageResult(rows.map(({ actor, ...revision }) => ({ ...revision, actor: personRef(actor) })), query, total);
}

async function lockTicket(tx: TransactionClient, ticketId: number): Promise<ActionParent> {
  const rows = await tx.$queryRaw<ActionParent[]>`
    SELECT "id", "currentStatus", "workCycle", "version", "createdAt"
    FROM "Ticket"
    WHERE "id" = ${ticketId}
    FOR UPDATE
  `;
  const ticket = rows[0];
  if (!ticket) throw HttpError.notFound("TICKET_NOT_FOUND", "The requested Ticket does not exist.");
  return ticket;
}

async function lockAction(tx: TransactionClient, ticketId: number, actionId: number): Promise<StaffAction> {
  const rows = await tx.$queryRaw<{ id: number }[]>`
    SELECT "id"
    FROM "ActionTaken"
    WHERE "id" = ${actionId} AND "ticketId" = ${ticketId}
    FOR UPDATE
  `;
  if (!rows[0]) throw HttpError.notFound("ACTION_NOT_FOUND", "The requested Action does not exist.");
  return tx.actionTaken.findUniqueOrThrow({ where: { id: actionId }, include: STAFF_ACTION_INCLUDE });
}

function assertParentWritable(parent: ActionParent): void {
  if (parent.currentStatus === "CLOSED" || parent.currentStatus === "CANCELLED") {
    throw HttpError.conflict("TICKET_FINAL", "Closed or Cancelled Tickets are read-only.");
  }
  if (parent.currentStatus === "RESOLVED") {
    throw HttpError.conflict("TICKET_ACTIONS_READ_ONLY", "Actions cannot be changed while the Ticket is Resolved.");
  }
}

function assertActionCycle(parent: ActionParent, action: Pick<StaffAction, "workCycle">): void {
  if (action.workCycle !== parent.workCycle) {
    throw HttpError.conflict("ACTION_CYCLE_READ_ONLY", "Actions from an earlier work cycle are read-only.");
  }
}

function assertTicketVersion(expected: number, parent: ActionParent): void {
  if (expected !== parent.version) {
    throw HttpError.conflict("STALE_TICKET_VERSION", "This Ticket changed. Reload it before saving.", {
      currentVersion: parent.version,
      reload: "ticket",
    });
  }
}

function assertActionVersion(expected: number, action: Pick<StaffAction, "version">): void {
  if (expected !== action.version) {
    throw HttpError.conflict("STALE_ACTION_VERSION", "This Action changed. Reload it before saving.", {
      currentVersion: action.version,
      reload: "action",
    });
  }
}

function assertEligibleAssignee(user: LockedOperationalUser | undefined): asserts user is LockedOperationalUser {
  if (!user || !assigneeEligible(user)) {
    throw HttpError.conflict("ASSIGNEE_NOT_ELIGIBLE", "Select an active IT Staff member or Administrator.");
  }
}

function fieldValidation(field: string, message: string): never {
  throw HttpError.validationFailed("The submitted data is invalid.", [{ field, message }]);
}

function validateFollowUp(required: boolean, note: string | null, field = "followUpNote"): void {
  if (required && !note) fieldValidation(field, "Follow-up Note is required when Follow-Up Required is checked.");
}

function validateOccurrenceDate(ticket: ActionParent, actionAt: Date, now: Date): void {
  if (!actionDateIsWithinTicket(ticket.createdAt, actionAt, now)) {
    fieldValidation("actionAt", "Action Date/Time must be between Ticket creation and the current server time.");
  }
}

async function findActionAssignee(ticketId: number, actionId: number): Promise<number> {
  const action = await getPrisma().actionTaken.findFirst({
    where: { id: actionId, ticketId },
    select: { assigneeId: true },
  });
  if (!action) throw HttpError.notFound("ACTION_NOT_FOUND", "The requested Action does not exist.");
  return action.assigneeId;
}

async function withStableAssignee<T>(
  ticketId: number,
  actionId: number,
  operation: (snapshotAssigneeId: number) => Promise<T>
): Promise<T> {
  let snapshotAssigneeId = await findActionAssignee(ticketId, actionId);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await operation(snapshotAssigneeId);
    } catch (error) {
      if (!(error instanceof AssigneeSnapshotChanged)) throw error;
      snapshotAssigneeId = await findActionAssignee(ticketId, actionId);
    }
  }
  throw HttpError.conflict("ACTION_CHANGED_RETRY", "The Action changed while locking its assignee. Reload and try again.");
}

export function actionSnapshot(action: Prisma.ActionTakenGetPayload<{}>) {
  return {
    id: action.id,
    ticketId: action.ticketId,
    workCycle: action.workCycle,
    status: action.status,
    description: action.description,
    result: action.result,
    actionAt: action.actionAt.toISOString(),
    assigneeId: action.assigneeId,
    createdById: action.createdById,
    performedById: action.performedById,
    followUpRequired: action.followUpRequired,
    followUpNote: action.followUpNote,
    attachmentNotes: action.attachmentNotes,
    version: action.version,
    createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString(),
    completedAt: action.completedAt?.toISOString() ?? null,
    cancelledAt: action.cancelledAt?.toISOString() ?? null,
    cancelledById: action.cancelledById,
    cancelReason: action.cancelReason,
  };
}

export async function appendActionRevision(
  tx: TransactionClient,
  action: Prisma.ActionTakenGetPayload<{}>,
  operation: "CREATE" | "EDIT" | "TRANSITION" | "TICKET_CANCEL",
  actorId: number,
  before: ReturnType<typeof actionSnapshot> | null,
  reason: string | null,
  occurredAt?: Date
): Promise<void> {
  await tx.actionRevision.create({
    data: {
      actionId: action.id,
      sequence: action.version,
      operation,
      actorId,
      ...(occurredAt && { occurredAt }),
      reason,
      before: before === null ? Prisma.DbNull : (before as Prisma.InputJsonValue),
      after: actionSnapshot(action),
    },
  });
}

async function incrementTicketVersion(tx: TransactionClient, ticketId: number): Promise<number> {
  const updated = await tx.ticket.update({
    where: { id: ticketId },
    data: { version: { increment: 1 } },
    select: { version: true },
  });
  return updated.version;
}

function idempotencyScope(
  actor: ActionRequestActor,
  method: "POST" | "PATCH",
  canonicalPath: string,
  key: string
): IdempotencyScope {
  return { userId: actor.userId, method, canonicalPath, key };
}

function transactionResult<T>(status: number, body: T): IdempotentWriteResult {
  return { status, body, replayed: false };
}

export async function createStaffAction(
  actor: ActionRequestActor,
  ticketId: number,
  rawBody: unknown,
  rawIdempotencyKey: string | undefined
): Promise<IdempotentWriteResult> {
  await findStaffParent(ticketId);
  const key = requireIdempotencyKey(rawIdempotencyKey);
  const parsed = actionCreateSchema.safeParse(rawBody);
  const digest = digestRequestBody(rawBody);
  const scope = idempotencyScope(actor, "POST", `/staff/tickets/${ticketId}/actions`, key);

  return getPrisma().$transaction(async (tx) => {
    const existing = await lockAndReadIdempotencyRecord(tx, scope);
    if (existing) {
      const users = await lockUsersInIdOrder(tx, [actor.userId]);
      await assertCurrentStaffSession(tx, actor.userId, actor.sessionId, users);
      await lockTicket(tx, ticketId);
      return replayIdempotencyRecord(existing, digest);
    }

    const assigneeId = parsed.success ? (parsed.data.assigneeId ?? actor.userId) : actor.userId;
    await notifyActionLockTestHook(tx, ticketId, "ACTION_BEFORE_USER_LOCKS", [actor.userId, assigneeId]);
    const users = await lockUsersInIdOrder(tx, [actor.userId, assigneeId]);
    await assertCurrentStaffSession(tx, actor.userId, actor.sessionId, users);
    await notifyActionLockTestHook(tx, ticketId, "ACTION_AFTER_USER_LOCKS", [...users.keys()]);
    const parent = await lockTicket(tx, ticketId);
    await notifyActionLockTestHook(tx, ticketId, "ACTION_AFTER_PARENT_LOCK", [...users.keys()]);
    assertParentWritable(parent);
    if (!parsed.success) throw parsed.error;
    const input: ActionCreateInput = parsed.data;
    assertTicketVersion(input.expectedTicketVersion, parent);
    const assignee = users.get(input.assigneeId ?? actor.userId);
    assertEligibleAssignee(assignee);

    const now = new Date();
    const actionAt = input.actionAt ?? now;
    validateOccurrenceDate(parent, actionAt, now);
    validateFollowUp(input.followUpRequired, input.followUpNote ?? null);

    const created = await tx.actionTaken.create({
      data: {
        ticketId,
        workCycle: parent.workCycle,
        status: "PLANNED",
        description: input.description,
        result: input.result ?? null,
        actionAt,
        assigneeId: assignee.id,
        createdById: actor.userId,
        followUpRequired: input.followUpRequired,
        followUpNote: input.followUpNote ?? null,
        attachmentNotes: input.attachmentNotes ?? null,
      },
      include: STAFF_ACTION_INCLUDE,
    });
    await appendActionRevision(tx, created, "CREATE", actor.userId, null, null);
    const ticketVersion = await incrementTicketVersion(tx, ticketId);
    await notifyActionLockTestHook(tx, ticketId, "ACTION_AFTER_WRITE", [actor.userId, assignee.id]);
    const body = { action: serializeStaffAction(created, { ...parent, version: ticketVersion }), ticketVersion };
    await saveIdempotencySuccess(tx, scope, digest, 201, body);
    return transactionResult(201, body);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

export async function patchStaffAction(
  actor: ActionRequestActor,
  ticketId: number,
  actionId: number,
  rawBody: unknown
): Promise<IdempotentWriteResult> {
  await findStaffParent(ticketId);
  const parsed = actionPatchSchema.safeParse(rawBody);

  return withStableAssignee(ticketId, actionId, async (snapshotAssigneeId) => {
    const candidateAssigneeId = parsed.success && parsed.data.assigneeId !== undefined
      ? parsed.data.assigneeId
      : snapshotAssigneeId;
    return getPrisma().$transaction(async (tx) => {
      await notifyActionLockTestHook(tx, ticketId, "ACTION_BEFORE_USER_LOCKS", [actor.userId, snapshotAssigneeId, candidateAssigneeId]);
      const users = await lockUsersInIdOrder(tx, [actor.userId, snapshotAssigneeId, candidateAssigneeId]);
      await assertCurrentStaffSession(tx, actor.userId, actor.sessionId, users);
      await notifyActionLockTestHook(tx, ticketId, "ACTION_AFTER_USER_LOCKS", [...users.keys()]);
      const parent = await lockTicket(tx, ticketId);
      assertParentWritable(parent);
      const action = await lockAction(tx, ticketId, actionId);
      if (action.assigneeId !== snapshotAssigneeId) throw new AssigneeSnapshotChanged(action.assigneeId);
      assertActionCycle(parent, action);
      if (!parsed.success) throw parsed.error;
      const input: ActionPatchInput = parsed.data;
      assertTicketVersion(input.expectedTicketVersion, parent);
      assertActionVersion(input.expectedActionVersion, action);

      const terminal = action.status === "COMPLETED" || action.status === "CANCELLED";
      const hasAssignee = Object.hasOwn(input, "assigneeId");
      if (terminal && hasAssignee) fieldValidation("assigneeId", "A terminal Action's assignee cannot be changed.");
      if (terminal && !input.correctionReason) fieldValidation("correctionReason", "Correction Reason is required for terminal Action changes.");
      if (!terminal && input.correctionReason !== undefined) fieldValidation("correctionReason", "Correction Reason is only accepted for terminal Action corrections.");

      const next = {
        description: input.description ?? action.description,
        result: Object.hasOwn(input, "result") ? (input.result ?? null) : action.result,
        actionAt: input.actionAt ?? action.actionAt,
        followUpRequired: input.followUpRequired ?? action.followUpRequired,
        followUpNote: Object.hasOwn(input, "followUpNote") ? (input.followUpNote ?? null) : action.followUpNote,
        attachmentNotes: Object.hasOwn(input, "attachmentNotes") ? (input.attachmentNotes ?? null) : action.attachmentNotes,
        assigneeId: input.assigneeId ?? action.assigneeId,
      };
      if (action.status === "COMPLETED" && !next.result) {
        fieldValidation("result", "Result is required for a Completed Action.");
      }
      validateFollowUp(next.followUpRequired, next.followUpNote);
      validateOccurrenceDate(parent, next.actionAt, new Date());

      const changed = next.description !== action.description || next.result !== action.result ||
        next.actionAt.getTime() !== action.actionAt.getTime() ||
        next.followUpRequired !== action.followUpRequired || next.followUpNote !== action.followUpNote ||
        next.attachmentNotes !== action.attachmentNotes || next.assigneeId !== action.assigneeId;
      if (!changed) fieldValidation("body", "Change at least one Action field before saving.");
      if (next.assigneeId !== action.assigneeId) assertEligibleAssignee(users.get(next.assigneeId));

      const before = actionSnapshot(action);
      const updated = await tx.actionTaken.update({
        where: { id: action.id },
        data: {
          ...next,
          version: { increment: 1 },
        } satisfies Prisma.ActionTakenUncheckedUpdateInput,
        include: STAFF_ACTION_INCLUDE,
      });
      await appendActionRevision(tx, updated, "EDIT", actor.userId, before, terminal ? input.correctionReason! : null);
      const ticketVersion = await incrementTicketVersion(tx, ticketId);
      return transactionResult(200, {
        action: serializeStaffAction(updated, { ...parent, version: ticketVersion }),
        ticketVersion,
      });
    });
  });
}

export async function transitionStaffAction(
  actor: ActionRequestActor,
  ticketId: number,
  actionId: number,
  rawBody: unknown,
  rawIdempotencyKey: string | undefined
): Promise<IdempotentWriteResult> {
  await findStaffParent(ticketId);
  await findActionAssignee(ticketId, actionId);
  const key = requireIdempotencyKey(rawIdempotencyKey);
  const parsed = actionTransitionSchema.safeParse(rawBody);
  const digest = digestRequestBody(rawBody);
  const scope = idempotencyScope(actor, "POST", `/staff/tickets/${ticketId}/actions/${actionId}/transitions`, key);

  return withStableAssignee(ticketId, actionId, async (snapshotAssigneeId) => getPrisma().$transaction(async (tx) => {
    const existing = await lockAndReadIdempotencyRecord(tx, scope);
    if (existing) {
      const users = await lockUsersInIdOrder(tx, [actor.userId]);
      await assertCurrentStaffSession(tx, actor.userId, actor.sessionId, users);
      await lockTicket(tx, ticketId);
      await lockAction(tx, ticketId, actionId);
      return replayIdempotencyRecord(existing, digest);
    }

    const needsAssignee = !parsed.success || parsed.data.status !== "CANCELLED";
    const userIds = needsAssignee ? [actor.userId, snapshotAssigneeId] : [actor.userId];
    await notifyActionLockTestHook(tx, ticketId, "ACTION_BEFORE_USER_LOCKS", userIds);
    const users = await lockUsersInIdOrder(tx, userIds);
    await assertCurrentStaffSession(tx, actor.userId, actor.sessionId, users);
    await notifyActionLockTestHook(tx, ticketId, "ACTION_AFTER_USER_LOCKS", [...users.keys()]);
    const parent = await lockTicket(tx, ticketId);
    assertParentWritable(parent);
    const action = await lockAction(tx, ticketId, actionId);
    if (needsAssignee && action.assigneeId !== snapshotAssigneeId) throw new AssigneeSnapshotChanged(action.assigneeId);
    assertActionCycle(parent, action);
    if (!parsed.success) throw parsed.error;
    const input: ActionTransitionInput = parsed.data;
    assertTicketVersion(input.expectedTicketVersion, parent);
    assertActionVersion(input.expectedActionVersion, action);
    if (!ACTION_TRANSITIONS[action.status].includes(input.status)) {
      throw HttpError.conflict("INVALID_ACTION_TRANSITION", "This Action transition is not permitted.");
    }

    const now = new Date();
    let update: Prisma.ActionTakenUncheckedUpdateInput;
    let reason: string | null = null;
    if (input.status === "IN_PROGRESS") {
      assertEligibleAssignee(users.get(action.assigneeId));
      update = { status: "IN_PROGRESS", version: { increment: 1 } };
    } else if (input.status === "COMPLETED") {
      assertEligibleAssignee(users.get(action.assigneeId));
      const result = Object.hasOwn(input, "result") ? (input.result ?? null) : action.result;
      const actionAt = input.actionAt ?? action.actionAt;
      const followUpRequired = input.followUpRequired ?? action.followUpRequired;
      const followUpNote = Object.hasOwn(input, "followUpNote") ? (input.followUpNote ?? null) : action.followUpNote;
      if (!result) fieldValidation("result", "Result is required to complete an Action.");
      validateOccurrenceDate(parent, actionAt, now);
      validateFollowUp(followUpRequired, followUpNote);
      update = {
        status: "COMPLETED",
        result,
        actionAt,
        followUpRequired,
        followUpNote,
        performedById: actor.userId,
        completedAt: now,
        version: { increment: 1 },
      };
    } else {
      reason = input.cancelReason;
      update = {
        status: "CANCELLED",
        cancelledById: actor.userId,
        cancelledAt: now,
        cancelReason: input.cancelReason,
        version: { increment: 1 },
      };
    }

    const before = actionSnapshot(action);
    const updated = await tx.actionTaken.update({ where: { id: action.id }, data: update, include: STAFF_ACTION_INCLUDE });
    await appendActionRevision(tx, updated, "TRANSITION", actor.userId, before, reason);
    const ticketVersion = await incrementTicketVersion(tx, ticketId);
    await notifyActionLockTestHook(tx, ticketId, "ACTION_AFTER_WRITE", userIds);
    const body = { action: serializeStaffAction(updated, { ...parent, version: ticketVersion }), ticketVersion };
    await saveIdempotencySuccess(tx, scope, digest, 200, body);
    return transactionResult(200, body);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }));
}
