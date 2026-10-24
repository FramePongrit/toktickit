import type { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";
import { getPrisma } from "../src/prisma.js";

export const BCRYPT_COST = 12;
const FIXTURE_TICKET_YEAR = 2026;
const FIXTURE_TICKET_MAX_SEQUENCE = 111;

// This value is local fixture input only. It is intentionally never returned
// or logged; production-created Initial Passwords are supplied by an Admin.
export const LEGACY_INITIAL_PASSWORD = "TokTickIT123!";

const CATEGORIES = ["Account and Access", "Hardware", "Software", "Network"];

const RELATED_SYSTEMS = [
  "Email",
  "Campus Wi-Fi",
  "VPN",
  "LEB2 App",
  "Grade Submission App",
  "Printer",
  "Corporate Laptop",
];

const REQUESTERS = [
  {
    fullName: "Jennifer Anderson",
    email: "jennifer.anderson@kmutt.ac.th",
    active: true,
    role: "REQUESTER" as const,
  },
  {
    fullName: "Michael Brown",
    email: "michael.brown@kmutt.ac.th",
    active: true,
    role: "REQUESTER" as const,
  },
  {
    fullName: "Sarah Johnson",
    email: "sarah.johnson@kmutt.ac.th",
    active: true,
    role: "REQUESTER" as const,
  },
  {
    fullName: "David Lee",
    email: "david.lee@kmutt.ac.th",
    active: true,
    role: "REQUESTER" as const,
  },
  {
    fullName: "Somsri Inactive",
    email: "somsri.inactive@kmutt.ac.th",
    active: false,
    role: "REQUESTER" as const,
  },
  {
    fullName: "No Ticket Requester",
    email: "no.ticket.requester@kmutt.ac.th",
    active: true,
    role: "REQUESTER" as const,
  },
];

const STAFF = [
  {
    fullName: "Niran Support",
    email: "niran.support@kmutt.ac.th",
    active: true,
    role: "STAFF" as const,
  },
  {
    fullName: "Pimchanok Support",
    email: "pimchanok.support@kmutt.ac.th",
    active: true,
    role: "STAFF" as const,
  },
  {
    fullName: "Arun Support",
    email: "arun.support@kmutt.ac.th",
    active: true,
    role: "STAFF" as const,
  },
  {
    fullName: "Somchai Former Staff",
    email: "somchai.former-staff@kmutt.ac.th",
    active: false,
    role: "STAFF" as const,
  },
];

const ADMIN = {
  fullName: "Kanya Administrator",
  email: "kanya.admin@kmutt.ac.th",
  active: true,
  role: "ADMIN" as const,
};

type SeedUserSpec = (typeof REQUESTERS)[number] | (typeof STAFF)[number] | typeof ADMIN;

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function ensureUser(
  prisma: PrismaClient,
  spec: SeedUserSpec,
  fixtureHash: string
) {
  const email = normalizedEmail(spec.email);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) return existing;

  return prisma.user.create({
    data: {
      fullName: spec.fullName,
      email,
      active: spec.active,
      role: spec.role,
      passwordHash: fixtureHash,
      mustChangePassword: true,
    },
  });
}

/**
 * Backfills every upgraded Requester that still has the Lab 2 null credential.
 * The null predicate is the idempotency boundary: a directly established
 * changed password and `mustChangePassword = false` are never overwritten.
 */
async function backfillMissingLegacyCredentials(prisma: PrismaClient, fixtureHash: string) {
  await prisma.user.updateMany({
    where: { role: "REQUESTER", passwordHash: null },
    data: { passwordHash: fixtureHash, mustChangePassword: true },
  });
}

const TICKET_FIXTURES = [
  { number: "TKT-2026-000101", requester: 0, category: "Account and Access", system: "Email", requestedPriority: "URGENT" as const, status: "NEW" as const, owner: null, summary: "Cannot access faculty mailbox", description: "The faculty mailbox rejects the sign-in attempt after the password was rotated." },
  { number: "TKT-2026-000102", requester: 1, category: "Hardware", system: "Corporate Laptop", requestedPriority: "HIGH" as const, status: "OPEN" as const, owner: "niran.support@kmutt.ac.th", summary: "Laptop will not start", description: "The power light comes on but the operating system does not load." },
  { number: "TKT-2026-000103", requester: 2, category: "Software", system: "LEB2 App", requestedPriority: "MEDIUM" as const, status: "IN_PROGRESS" as const, owner: "pimchanok.support@kmutt.ac.th", summary: "Grade submission error", description: "Submitting a grade returns an unexpected validation error for one course." },
  { number: "TKT-2026-000104", requester: 3, category: "Network", system: "Campus Wi-Fi", requestedPriority: "HIGH" as const, status: "WAITING_FOR_REQUESTER" as const, owner: "kanya.admin@kmutt.ac.th", summary: "Intermittent Wi-Fi in office", description: "The connection drops several times each morning in the north office." },
  { number: "TKT-2026-000105", requester: 0, category: "Account and Access", system: "VPN", requestedPriority: "LOW" as const, status: "RESOLVED" as const, owner: "arun.support@kmutt.ac.th", summary: "VPN profile repaired", description: "The VPN profile was rebuilt and the requester confirmed the connection works." },
  { number: "TKT-2026-000106", requester: 1, category: "Software", system: "Printer", requestedPriority: "MEDIUM" as const, status: "REOPENED" as const, owner: "niran.support@kmutt.ac.th", summary: "Printer queue returned", description: "Printing worked briefly after the first fix but the queue has returned.", workCycle: 2 },
  { number: "TKT-2026-000107", requester: 2, category: "Hardware", system: "Corporate Laptop", requestedPriority: "URGENT" as const, status: "CLOSED" as const, owner: "somchai.former-staff@kmutt.ac.th", summary: "Replacement laptop delivered", description: "The replacement device was delivered and the old device was collected." },
  { number: "TKT-2026-000108", requester: 3, category: "Network", system: "VPN", requestedPriority: "LOW" as const, status: "CANCELLED" as const, owner: "pimchanok.support@kmutt.ac.th", summary: "Duplicate VPN request", description: "The requester confirmed that another ticket already covers this request." },
  { number: "TKT-2026-000109", requester: 0, category: "Software", system: "Email", requestedPriority: "MEDIUM" as const, status: "OPEN" as const, owner: "niran.support@kmutt.ac.th", summary: "Problem appears resolved", description: "The requester has reported that the issue appears resolved while staff follow up.", indication: true },
  { number: "TKT-2026-000110", requester: 1, category: "Hardware", system: "Printer", requestedPriority: "HIGH" as const, status: "REOPENED" as const, owner: "niran.support@kmutt.ac.th", summary: "Printer queue needs a second work cycle", description: "A new printer queue issue demonstrates retained first-cycle work and current-cycle Actions.", workCycle: 2 },
  { number: "TKT-2026-000111", requester: 2, category: "Account and Access", system: "VPN", requestedPriority: "LOW" as const, status: "RESOLVED" as const, owner: "pimchanok.support@kmutt.ac.th", summary: "VPN access restored with verified work", description: "A completed current-cycle Action supports the resolved Ticket fixture." },
];

type SeedActionFixture = {
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  description: string;
  assignee: string;
  actor: string;
  result?: string;
  followUpNote?: string;
  attachmentNotes?: string;
  cycle?: number;
  cancelReason?: string;
};

const ACTION_FIXTURES: Record<string, SeedActionFixture[]> = {
  "TKT-2026-000102": [
    { status: "PLANNED", description: "Inspect the laptop power adapter", assignee: "niran.support@kmutt.ac.th", actor: "niran.support@kmutt.ac.th" },
  ],
  "TKT-2026-000103": [
    { status: "IN_PROGRESS", description: "Reproduce the grade submission validation error", assignee: "pimchanok.support@kmutt.ac.th", actor: "niran.support@kmutt.ac.th" },
    { status: "COMPLETED", description: "Check the affected course configuration", assignee: "pimchanok.support@kmutt.ac.th", actor: "kanya.admin@kmutt.ac.th", result: "The configuration matches the current grading policy.", followUpNote: "Requester confirmation is still needed." },
    { status: "CANCELLED", description: "Reinstall the submission client", assignee: "arun.support@kmutt.ac.th", actor: "niran.support@kmutt.ac.th", cancelReason: "The error is isolated to course configuration." },
  ],
  "TKT-2026-000105": [
    { status: "COMPLETED", description: "Rebuild and verify the VPN profile", assignee: "arun.support@kmutt.ac.th", actor: "arun.support@kmutt.ac.th", result: "A fresh profile connected successfully." },
  ],
  "TKT-2026-000106": [
    { status: "COMPLETED", description: "Clear the original printer queue", assignee: "somchai.former-staff@kmutt.ac.th", actor: "niran.support@kmutt.ac.th", result: "The original queue was cleared during the first work cycle.", cycle: 1 },
    { status: "PLANNED", description: "Inspect the returning printer queue", assignee: "niran.support@kmutt.ac.th", actor: "niran.support@kmutt.ac.th", cycle: 2 },
  ],
  "TKT-2026-000107": [
    { status: "COMPLETED", description: "Deliver and verify the replacement laptop", assignee: "somchai.former-staff@kmutt.ac.th", actor: "niran.support@kmutt.ac.th", result: "The requester confirmed the replacement laptop works." },
  ],
  "TKT-2026-000108": [
    { status: "CANCELLED", description: "Check whether the duplicate VPN request needs work", assignee: "pimchanok.support@kmutt.ac.th", actor: "pimchanok.support@kmutt.ac.th", cancelReason: "The requester confirmed another ticket covers the same request." },
  ],
  "TKT-2026-000110": [
    { status: "COMPLETED", description: "Clear the original printer queue", assignee: "somchai.former-staff@kmutt.ac.th", actor: "niran.support@kmutt.ac.th", result: "The first queue was cleared before the Ticket was resolved.", cycle: 1 },
    { status: "PLANNED", description: "Inspect the recurring printer queue", assignee: "somchai.former-staff@kmutt.ac.th", actor: "niran.support@kmutt.ac.th", cycle: 2 },
    { status: "IN_PROGRESS", description: "Collect current queue diagnostics", assignee: "pimchanok.support@kmutt.ac.th", actor: "niran.support@kmutt.ac.th", cycle: 2 },
    { status: "COMPLETED", description: "Rebuild the printer queue", assignee: "arun.support@kmutt.ac.th", actor: "kanya.admin@kmutt.ac.th", result: "The queue was rebuilt and a test page printed.", followUpNote: "Requester confirmation is still needed.", cycle: 2 },
    { status: "CANCELLED", description: "Replace the printer driver", assignee: "arun.support@kmutt.ac.th", actor: "niran.support@kmutt.ac.th", cancelReason: "The existing driver works after queue repair.", cycle: 2 },
  ],
  "TKT-2026-000111": [
    { status: "COMPLETED", description: "Verify the VPN access profile", assignee: "pimchanok.support@kmutt.ac.th", actor: "kanya.admin@kmutt.ac.th", result: "The requester connected successfully with the repaired profile." },
  ],
};

const STATUS_PATHS = {
  NEW: [],
  OPEN: ["OPEN"],
  IN_PROGRESS: ["OPEN", "IN_PROGRESS"],
  WAITING_FOR_REQUESTER: ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER"],
  RESOLVED: ["OPEN", "IN_PROGRESS", "RESOLVED"],
  REOPENED: ["OPEN", "IN_PROGRESS", "RESOLVED", "REOPENED"],
  CLOSED: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
  CANCELLED: ["CANCELLED"],
} as const;

type SeedTicket = (typeof TICKET_FIXTURES)[number];

function ticketPath(status: SeedTicket["status"]): readonly SeedTicket["status"][] {
  return STATUS_PATHS[status];
}

function ticketResolvedTransitionAt(status: SeedTicket["status"], createdAt: Date): Date | null {
  const resolvedIndex = ticketPath(status).indexOf("RESOLVED");
  return resolvedIndex < 0 ? null : new Date(createdAt.getTime() + (resolvedIndex + 1) * 60 * 60 * 1000);
}

function ticketResolvedAt(status: SeedTicket["status"], createdAt: Date): Date | null {
  return status === "REOPENED" ? null : ticketResolvedTransitionAt(status, createdAt);
}

function actionWriteCount(fixture: SeedTicket): number {
  return (ACTION_FIXTURES[fixture.number] ?? []).reduce(
    (count, action) => count + (action.status === "PLANNED" ? 1 : 2),
    0
  );
}

function actionSnapshot(action: {
  id: number;
  ticketId: number;
  workCycle: number;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  description: string;
  result: string | null;
  actionAt: Date;
  assigneeId: number;
  createdById: number;
  performedById: number | null;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelledById: number | null;
  cancelReason: string | null;
}): Prisma.InputJsonObject {
  return {
    ...action,
    actionAt: action.actionAt.toISOString(),
    createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString(),
    completedAt: action.completedAt?.toISOString() ?? null,
    cancelledAt: action.cancelledAt?.toISOString() ?? null,
  };
}

export async function seedDatabase(prisma: PrismaClient = getPrisma()): Promise<void> {
  const fixtureHash = await bcrypt.hash(LEGACY_INITIAL_PASSWORD, BCRYPT_COST);

  for (const name of CATEGORIES) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const name of RELATED_SYSTEMS) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  await backfillMissingLegacyCredentials(prisma, fixtureHash);

  const requesterUsers = [];
  for (const spec of REQUESTERS) requesterUsers.push(await ensureUser(prisma, spec, fixtureHash));

  const staffUsers = [];
  for (const spec of STAFF) staffUsers.push(await ensureUser(prisma, spec, fixtureHash));

  const administrator = await ensureUser(prisma, ADMIN, fixtureHash);
  const usersByEmail = new Map(
    [...requesterUsers, ...staffUsers, administrator].map((user) => [user.email, user])
  );
  const categoriesByName = new Map(
    (await prisma.category.findMany({ where: { name: { in: CATEGORIES } } })).map((row) => [row.name, row])
  );
  const systemsByName = new Map(
    (await prisma.relatedSystem.findMany({ where: { name: { in: RELATED_SYSTEMS } } })).map((row) => [row.name, row])
  );

  const seededTickets = new Map<string, Awaited<ReturnType<typeof prisma.ticket.upsert>>>();
  const seedStartedAt = new Date();
  for (const fixture of TICKET_FIXTURES) {
    const requester = requesterUsers[fixture.requester];
    const category = categoriesByName.get(fixture.category);
    const relatedSystem = systemsByName.get(fixture.system);
    const owner = fixture.owner ? usersByEmail.get(fixture.owner) : undefined;
    if (!category || !relatedSystem || !owner && fixture.owner) {
      throw new Error("Seed reference data is incomplete.");
    }

    const ticketCreatedAt = new Date(seedStartedAt.getTime() - 5 * 60 * 60 * 1000);
    const statusUpdatedAt = new Date(
      ticketCreatedAt.getTime() + ticketPath(fixture.status).length * 60 * 60 * 1000
    );
    const reopenedIndex = ticketPath(fixture.status).indexOf("REOPENED");
    const reopenedAt = reopenedIndex < 0
      ? null
      : new Date(ticketCreatedAt.getTime() + (reopenedIndex + 1) * 60 * 60 * 1000);
    const lastActionWriteAt = (ACTION_FIXTURES[fixture.number] ?? []).reduce((latest, action, index) => {
      const cycle = action.cycle ?? fixture.workCycle ?? 1;
      const cycleStart = cycle > 1 && reopenedAt ? reopenedAt : ticketCreatedAt;
      const actionCreatedAt = new Date(cycleStart.getTime() + 10 * 60 * 1000 + index * 2 * 60 * 1000);
      const latestWriteAt = action.status === "PLANNED"
        ? actionCreatedAt
        : new Date(actionCreatedAt.getTime() + 60 * 1000);
      return latestWriteAt > latest ? latestWriteAt : latest;
    }, ticketCreatedAt);
    const ticketUpdatedAt = lastActionWriteAt > statusUpdatedAt ? lastActionWriteAt : statusUpdatedAt;
    const ticket = await prisma.ticket.upsert({
      where: { ticketNumber: fixture.number },
      update: {},
      create: {
        ticketNumber: fixture.number,
        requesterId: requester.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        requestedPriority: fixture.requestedPriority,
        itPriority: fixture.requestedPriority,
        ownerId: owner?.id ?? null,
        summary: fixture.summary,
        description: fixture.description,
        currentStatus: fixture.status,
        workCycle: fixture.workCycle ?? 1,
        version: ticketPath(fixture.status).length + actionWriteCount(fixture) + 1,
        resolvedAt: ticketResolvedAt(fixture.status, ticketCreatedAt),
        createdAt: ticketCreatedAt,
        updatedAt: ticketUpdatedAt,
        ...(fixture.indication && {
          resolutionIndicatedAt: new Date(ticketCreatedAt.getTime() + 30 * 60 * 1000),
          resolutionIndicatedById: requester.id,
        }),
      },
    });
    seededTickets.set(fixture.number, ticket);
  }

  const seedableTickets = new Set<number>();
  for (const ticket of seededTickets.values()) {
    const [eventCount, actionCount] = await Promise.all([
      prisma.ticketWorkflowEvent.count({ where: { ticketId: ticket.id } }),
      prisma.actionTaken.count({ where: { ticketId: ticket.id } }),
    ]);
    if (eventCount === 0 && actionCount === 0) seedableTickets.add(ticket.id);
  }

  const waitingTicket = seededTickets.get("TKT-2026-000104");
  const resolvedTicket = seededTickets.get("TKT-2026-000105");
  const closedTicket = seededTickets.get("TKT-2026-000107");
  const staffAuthor = usersByEmail.get("niran.support@kmutt.ac.th");
  if (!waitingTicket || !resolvedTicket || !closedTicket || !staffAuthor) {
    throw new Error("Seed workflow fixtures are incomplete.");
  }

  const waitingCommentBody = "Please confirm whether the connection drops on another floor.";
  const comments = [
    { ticketId: waitingTicket.id, authorId: waitingTicket.requesterId, body: waitingCommentBody },
    { ticketId: resolvedTicket.id, authorId: staffAuthor.id, body: "The VPN profile was rebuilt; please confirm the next connection attempt." },
    { ticketId: closedTicket.id, authorId: closedTicket.requesterId, body: "The replacement device is working well. Thank you." },
  ].filter((comment) => seedableTickets.has(comment.ticketId));
  for (const comment of comments) {
    const existing = await prisma.publicComment.findFirst({ where: comment, select: { id: true } });
    if (!existing) await prisma.publicComment.create({ data: comment });
  }

  const notes = [
    { ticketId: waitingTicket.id, authorId: staffAuthor.id, body: "Awaiting a floor/location confirmation before checking the access point." },
    { ticketId: resolvedTicket.id, authorId: staffAuthor.id, body: "Profile reset completed and connection test passed." },
    { ticketId: closedTicket.id, authorId: staffAuthor.id, body: "Historical note: replacement device handover completed." },
  ].filter((note) => seedableTickets.has(note.ticketId));
  for (const note of notes) {
    const existing = await prisma.internalNote.findFirst({ where: note, select: { id: true } });
    if (!existing) await prisma.internalNote.create({ data: note });
  }

  const waitingComment = seedableTickets.has(waitingTicket.id)
    ? await prisma.publicComment.findFirst({
        where: { ticketId: waitingTicket.id, body: waitingCommentBody },
        select: { id: true },
      })
    : null;
  const seedActor = usersByEmail.get("niran.support@kmutt.ac.th");
  if (!seedActor) throw new Error("Seed workflow fixtures are incomplete.");

  for (const fixture of TICKET_FIXTURES) {
    const ticket = seededTickets.get(fixture.number);
    if (!ticket) throw new Error("Seed ticket is missing.");
    if (!seedableTickets.has(ticket.id)) continue;
    if (fixture.status === "WAITING_FOR_REQUESTER" && !waitingComment) {
      throw new Error("Seed workflow fixtures are incomplete.");
    }

    await prisma.$transaction(async (tx) => {
      const actionFixtures = ACTION_FIXTURES[fixture.number] ?? [];
      const actionOperations: { createdAt: Date; transitionAt: Date | null }[] = [];
      const reopenedIndex = ticketPath(fixture.status).indexOf("REOPENED");
      const reopenedAt = reopenedIndex < 0
        ? null
        : new Date(ticket.createdAt.getTime() + (reopenedIndex + 1) * 60 * 60 * 1000);
      const cycleOneResolveAt = ticketResolvedTransitionAt(fixture.status, ticket.createdAt);
      for (const [index, actionFixture] of actionFixtures.entries()) {
        const assignee = usersByEmail.get(actionFixture.assignee);
        const creator = usersByEmail.get("niran.support@kmutt.ac.th");
        const actor = usersByEmail.get(actionFixture.actor);
        if (!assignee || !creator || !actor) throw new Error("Seed Action identities are incomplete.");

        const actionCycle = actionFixture.cycle ?? fixture.workCycle ?? 1;
        const cycleStart = actionCycle > 1 && reopenedAt ? reopenedAt : ticket.createdAt;
        const actionCreatedAt = new Date(cycleStart.getTime() + 10 * 60 * 1000 + index * 2 * 60 * 1000);
        const actionTransitionAt = actionFixture.status === "PLANNED"
          ? null
          : actionFixture.status === "COMPLETED" && actionCycle === 1 && cycleOneResolveAt
            ? new Date(cycleOneResolveAt.getTime() - 60 * 1000)
            : new Date(actionCreatedAt.getTime() + 60 * 1000);
        actionOperations.push({ createdAt: actionCreatedAt, transitionAt: actionTransitionAt });
        const actionVersion = actionFixture.status === "PLANNED" ? 1 : 2;
        const savedAction = await tx.actionTaken.create({
          data: {
            ticketId: ticket.id,
            workCycle: actionCycle,
            status: actionFixture.status,
            description: actionFixture.description,
            result: actionFixture.result ?? null,
            actionAt: actionCreatedAt,
            assigneeId: assignee.id,
            createdById: creator.id,
            performedById: actionFixture.status === "COMPLETED" ? actor.id : null,
            followUpRequired: Boolean(actionFixture.followUpNote),
            followUpNote: actionFixture.followUpNote ?? null,
            attachmentNotes: actionFixture.attachmentNotes ?? null,
            version: actionVersion,
            createdAt: actionCreatedAt,
            updatedAt: actionTransitionAt ?? actionCreatedAt,
            completedAt: actionFixture.status === "COMPLETED" ? actionTransitionAt : null,
            cancelledAt: actionFixture.status === "CANCELLED" ? actionTransitionAt : null,
            cancelledById: actionFixture.status === "CANCELLED" ? actor.id : null,
            cancelReason: actionFixture.status === "CANCELLED" ? actionFixture.cancelReason : null,
          },
        });

        const plannedSnapshot = actionSnapshot({
          ...savedAction,
          status: "PLANNED",
          version: 1,
          updatedAt: actionCreatedAt,
          performedById: null,
          completedAt: null,
          cancelledAt: null,
          cancelledById: null,
          cancelReason: null,
        });
        await tx.actionRevision.create({
          data: {
            actionId: savedAction.id,
            sequence: 1,
            operation: "CREATE",
            actorId: creator.id,
            occurredAt: actionCreatedAt,
            after: actionFixture.status === "PLANNED" ? actionSnapshot(savedAction) : plannedSnapshot,
          },
        });
        if (actionFixture.status !== "PLANNED") {
          await tx.actionRevision.create({
            data: {
              actionId: savedAction.id,
              sequence: 2,
              operation: "TRANSITION",
              actorId: actor.id,
              occurredAt: actionTransitionAt!,
              reason: actionFixture.status === "CANCELLED" ? actionFixture.cancelReason : null,
              before: plannedSnapshot,
              after: actionSnapshot(savedAction),
            },
          });
        }
      }

      let fromStatus: "NEW" | SeedTicket["status"] = "NEW";
      await tx.ticketWorkflowEvent.create({
        data: {
          ticketId: ticket.id,
          workCycle: 1,
          kind: "CREATED",
          fromStatus: null,
          toStatus: "NEW",
          actorId: ticket.requesterId,
          occurredAt: ticket.createdAt,
          ticketVersion: 1,
        },
      });

      const path = ticketPath(fixture.status);
      let currentCycle = 1;
      for (const [index, toStatus] of path.entries()) {
        const occurredAt = new Date(ticket.createdAt.getTime() + (index + 1) * 60 * 60 * 1000);
        if (toStatus === "REOPENED") currentCycle += 1;
        const priorActionWrites = actionOperations.reduce(
          (count, operation) =>
            count + Number(operation.createdAt < occurredAt) +
              Number(Boolean(operation.transitionAt && operation.transitionAt < occurredAt)),
          0
        );
        await tx.ticketWorkflowEvent.create({
          data: {
            ticketId: ticket.id,
            workCycle: currentCycle,
            kind: "TRANSITION",
            fromStatus,
            toStatus,
            actorId: seedActor.id,
            occurredAt,
            publicCommentId: toStatus === "WAITING_FOR_REQUESTER" ? waitingComment?.id ?? null : null,
            reason: toStatus === "CANCELLED" ? "Seed fixture cancelled before work began." : null,
            ticketVersion: index + 2 + priorActionWrites,
          },
        });
        fromStatus = toStatus;
      }
    });
  }

  // Fixed fixture ticket numbers occupy 000101 through 000111. Advance the
  // allocator floor atomically, but never reduce a counter advanced by real
  // local data or a previous test run.
  await prisma.$executeRaw`
    INSERT INTO "TicketCounter" ("year", "lastValue")
    VALUES (${FIXTURE_TICKET_YEAR}, ${FIXTURE_TICKET_MAX_SEQUENCE})
    ON CONFLICT ("year") DO UPDATE
    SET "lastValue" = GREATEST("TicketCounter"."lastValue", EXCLUDED."lastValue")
  `;

  await prisma.ticketCounter.upsert({
    where: { year: new Date().getFullYear() },
    update: {},
    create: { year: new Date().getFullYear() },
  });

  const activeRequesters = REQUESTERS.filter((user) => user.active).length;
  const activeStaff = STAFF.filter((user) => user.active).length;
  console.log(
    `Seeded ${CATEGORIES.length} categories, ${RELATED_SYSTEMS.length} related systems, ` +
      `${activeRequesters} active requesters, ${activeStaff} active IT staff, and 1 active administrator.`
  );
}

async function main() {
  await seedDatabase();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await getPrisma().$disconnect();
    });
}
