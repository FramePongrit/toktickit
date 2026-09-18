import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";
import { getPrisma } from "../src/prisma.js";

export const BCRYPT_COST = 12;
const FIXTURE_TICKET_YEAR = 2026;
const FIXTURE_TICKET_MAX_SEQUENCE = 109;

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
  { number: "TKT-2026-000106", requester: 1, category: "Software", system: "Printer", requestedPriority: "MEDIUM" as const, status: "REOPENED" as const, owner: "niran.support@kmutt.ac.th", summary: "Printer queue returned", description: "Printing worked briefly after the first fix but the queue has returned." },
  { number: "TKT-2026-000107", requester: 2, category: "Hardware", system: "Corporate Laptop", requestedPriority: "URGENT" as const, status: "CLOSED" as const, owner: "somchai.former-staff@kmutt.ac.th", summary: "Replacement laptop delivered", description: "The replacement device was delivered and the old device was collected." },
  { number: "TKT-2026-000108", requester: 3, category: "Network", system: "VPN", requestedPriority: "LOW" as const, status: "CANCELLED" as const, owner: "pimchanok.support@kmutt.ac.th", summary: "Duplicate VPN request", description: "The requester confirmed that another ticket already covers this request." },
  { number: "TKT-2026-000109", requester: 0, category: "Software", system: "Email", requestedPriority: "MEDIUM" as const, status: "OPEN" as const, owner: "niran.support@kmutt.ac.th", summary: "Problem appears resolved", description: "The requester has reported that the issue appears resolved while staff follow up.", indication: true },
];

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
  for (const fixture of TICKET_FIXTURES) {
    const requester = requesterUsers[fixture.requester];
    const category = categoriesByName.get(fixture.category);
    const relatedSystem = systemsByName.get(fixture.system);
    const owner = fixture.owner ? usersByEmail.get(fixture.owner) : undefined;
    if (!category || !relatedSystem || !owner && fixture.owner) {
      throw new Error("Seed reference data is incomplete.");
    }

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
        ...(fixture.indication && {
          resolutionIndicatedAt: new Date("2026-09-01T09:00:00.000Z"),
          resolutionIndicatedById: requester.id,
        }),
      },
    });
    seededTickets.set(fixture.number, ticket);
  }

  const waitingTicket = seededTickets.get("TKT-2026-000104");
  const resolvedTicket = seededTickets.get("TKT-2026-000105");
  const closedTicket = seededTickets.get("TKT-2026-000107");
  const staffAuthor = usersByEmail.get("niran.support@kmutt.ac.th");
  if (!waitingTicket || !resolvedTicket || !closedTicket || !staffAuthor) {
    throw new Error("Seed workflow fixtures are incomplete.");
  }

  const comments = [
    { ticketId: waitingTicket.id, authorId: waitingTicket.requesterId, body: "Please confirm whether the connection drops on another floor." },
    { ticketId: resolvedTicket.id, authorId: staffAuthor.id, body: "The VPN profile was rebuilt; please confirm the next connection attempt." },
    { ticketId: closedTicket.id, authorId: closedTicket.requesterId, body: "The replacement device is working well. Thank you." },
  ];
  for (const comment of comments) {
    const existing = await prisma.publicComment.findFirst({ where: comment, select: { id: true } });
    if (!existing) await prisma.publicComment.create({ data: comment });
  }

  const notes = [
    { ticketId: waitingTicket.id, authorId: staffAuthor.id, body: "Awaiting a floor/location confirmation before checking the access point." },
    { ticketId: resolvedTicket.id, authorId: staffAuthor.id, body: "Profile reset completed and connection test passed." },
    { ticketId: closedTicket.id, authorId: staffAuthor.id, body: "Historical note: replacement device handover completed." },
  ];
  for (const note of notes) {
    const existing = await prisma.internalNote.findFirst({ where: note, select: { id: true } });
    if (!existing) await prisma.internalNote.create({ data: note });
  }

  // Fixed fixture ticket numbers occupy 000101 through 000109. Advance the
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
