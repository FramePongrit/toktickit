import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

const prisma = getPrisma();
const suiteTag = randomUUID();

// Two requesters, so ownership isolation is asserted rather than assumed.
let requesterA: number;
let requesterB: number;
let categoryHardware: number;
let categorySoftware: number;
let systemOne: number;
let systemTwo: number;

/** Tickets are created directly through Prisma so this suite does not depend on the create endpoint. */
async function seedTicket(
  requesterId: number,
  overrides: Partial<{
    summary: string;
    categoryId: number;
    relatedSystemId: number;
    requestedPriority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    createdAt: Date;
    ticketNumber: string;
  }> = {}
) {
  return prisma.ticket.create({
    data: {
      ticketNumber: overrides.ticketNumber ?? `TKT-2026-${randomUUID().slice(0, 8)}`,
      requesterId,
      categoryId: overrides.categoryId ?? categoryHardware,
      relatedSystemId: overrides.relatedSystemId ?? systemOne,
      requestedPriority: overrides.requestedPriority ?? "MEDIUM",
      summary: overrides.summary ?? "Placeholder summary for testing",
      description: "A description long enough to satisfy the minimum length rule.",
      ...(overrides.createdAt && { createdAt: overrides.createdAt }),
    },
  });
}

function list(requesterId: number, query: Record<string, string | number> = {}) {
  return request(app)
    .get("/api/tickets")
    .query(query)
    .set("X-Requester-Id", String(requesterId));
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    prisma.requesterUser.create({
      data: { fullName: "List Suite A", email: `list-a-${suiteTag}@lab2.local` },
    }),
    prisma.requesterUser.create({
      data: { fullName: "List Suite B", email: `list-b-${suiteTag}@lab2.local` },
    }),
  ]);
  requesterA = a.id;
  requesterB = b.id;

  const categories = await prisma.category.findMany({ where: { active: true }, orderBy: { id: "asc" } });
  const systems = await prisma.relatedSystem.findMany({ where: { active: true }, orderBy: { id: "asc" } });
  categoryHardware = categories[0].id;
  categorySoftware = categories[1].id;
  systemOne = systems[0].id;
  systemTwo = systems[1].id;

  // Requester A: 12 tickets, enough for three pages of 5 and a partial last page.
  // All share one createdAt so the stable-pagination test has real ties to break.
  const tiedAt = new Date("2026-05-01T00:00:00.000Z");
  for (let i = 1; i <= 12; i += 1) {
    await seedTicket(requesterA, {
      ticketNumber: `TKT-2026-90${String(i).padStart(4, "0")}`,
      summary: `Shared tie summary ${i}`,
      createdAt: tiedAt,
    });
  }

  // Distinguishable tickets for search, filter and sort assertions.
  await seedTicket(requesterA, {
    ticketNumber: `TKT-2026-950001`,
    summary: "Printer jams on duplex printing",
    categoryId: categorySoftware,
    relatedSystemId: systemTwo,
    requestedPriority: "URGENT",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
  });
  await seedTicket(requesterA, {
    ticketNumber: `TKT-2026-950002`,
    summary: "VPN disconnects every ten minutes",
    categoryId: categorySoftware,
    relatedSystemId: systemTwo,
    requestedPriority: "LOW",
    createdAt: new Date("2026-06-02T00:00:00.000Z"),
  });

  // Requester B owns one ticket that must never leak into A's results.
  await seedTicket(requesterB, {
    ticketNumber: `TKT-2026-960001`,
    summary: "Belongs to requester B only",
  });
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { requesterId: { in: [requesterA, requesterB] } } });
  await prisma.requesterUser.deleteMany({ where: { id: { in: [requesterA, requesterB] } } });
  await prisma.$disconnect();
});

describe("GET /api/tickets — ownership", () => {
  it("API-16: returns only the caller's own tickets", async () => {
    const res = await list(requesterA, { pageSize: 50 });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(14);
    expect(res.body.data.every((t: any) => t.summary !== "Belongs to requester B only")).toBe(true);

    const other = await list(requesterB, { pageSize: 50 });
    expect(other.body.total).toBe(1);
    expect(other.body.data[0].summary).toBe("Belongs to requester B only");
  });

  it("API-17: ignores a requesterId supplied as a query parameter", async () => {
    // Ownership comes from the header alone. Supplying requesterId must not
    // widen the result set to another requester's data (BR-16).
    const res = await list(requesterB, { requesterId: requesterA, pageSize: 50 });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });
});

describe("GET /api/tickets — search and filters", () => {
  it("API-18: matches a ticket number case-insensitively", async () => {
    const res = await list(requesterA, { q: "tkt-2026-950001" });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].ticketNumber).toBe("TKT-2026-950001");
  });

  it("API-19: matches part of a summary case-insensitively", async () => {
    const res = await list(requesterA, { q: "PRINTER" });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].summary).toBe("Printer jams on duplex printing");
  });

  it("API-20: filters by category", async () => {
    const res = await list(requesterA, { categoryId: categorySoftware, pageSize: 50 });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.data.every((t: any) => t.category.id === categorySoftware)).toBe(true);
  });

  it("API-21: filters by related system", async () => {
    const res = await list(requesterA, { relatedSystemId: systemTwo, pageSize: 50 });

    expect(res.status).toBe(200);
    expect(res.body.data.every((t: any) => t.relatedSystem.id === systemTwo)).toBe(true);
  });

  it("API-22: filters by requested priority", async () => {
    const res = await list(requesterA, { priority: "URGENT", pageSize: 50 });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].requestedPriority).toBe("URGENT");
  });

  it("API-23: combines filters conjunctively", async () => {
    const both = await list(requesterA, {
      categoryId: categorySoftware,
      priority: "URGENT",
      pageSize: 50,
    });
    expect(both.body.total).toBe(1);

    // The same priority against the other category must match nothing.
    const contradictory = await list(requesterA, {
      categoryId: categoryHardware,
      priority: "URGENT",
      pageSize: 50,
    });
    expect(contradictory.body.total).toBe(0);
  });

  it("API-31: returns an empty page rather than an error when nothing matches", async () => {
    const res = await list(requesterA, { q: "nothing-matches-this-string" });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
    expect(res.body.totalPages).toBe(0);
  });
});

describe("GET /api/tickets — sorting", () => {
  it("API-25: defaults to newest first", async () => {
    const res = await list(requesterA, { pageSize: 50 });

    const dates = res.body.data.map((t: any) => new Date(t.createdAt).getTime());
    expect([...dates]).toEqual([...dates].sort((x, y) => y - x));
  });

  it("API-24: sorts by each whitelisted field in both directions", async () => {
    for (const sort of ["createdAt", "ticketNumber", "summary"]) {
      const asc = await list(requesterA, { sort, order: "asc", pageSize: 50 });
      const desc = await list(requesterA, { sort, order: "desc", pageSize: 50 });

      expect(asc.status).toBe(200);
      expect(desc.status).toBe(200);

      const ascValues = asc.body.data.map((t: any) => t[sort]);
      const descValues = desc.body.data.map((t: any) => t[sort]);
      expect(ascValues).toEqual([...ascValues].sort());
      expect(descValues).toEqual([...ascValues].sort().reverse());
    }
  });

  it("API-24: orders priority by severity, not alphabetically", async () => {
    const res = await list(requesterA, {
      sort: "requestedPriority",
      order: "asc",
      pageSize: 50,
    });

    const priorities: string[] = res.body.data.map((t: any) => t.requestedPriority);
    // Alphabetically LOW would follow HIGH; by severity it comes first. The
    // enum is declared in severity order precisely so this holds.
    expect(priorities[0]).toBe("LOW");
    expect(priorities[priorities.length - 1]).toBe("URGENT");
  });
});

describe("GET /api/tickets — pagination", () => {
  it("API-27: pages are disjoint and total describes the whole result", async () => {
    const first = await list(requesterA, { page: 1, pageSize: 10 });
    const second = await list(requesterA, { page: 2, pageSize: 10 });

    expect(first.body.total).toBe(14);
    expect(first.body.totalPages).toBe(2);
    expect(first.body.data).toHaveLength(10);
    expect(second.body.data).toHaveLength(4); // partial last page

    const firstIds = first.body.data.map((t: any) => t.id);
    const secondIds = second.body.data.map((t: any) => t.id);
    expect(firstIds.filter((id: number) => secondIds.includes(id))).toEqual([]);
  });

  it("API-26: pagination stays stable when the sort values tie", async () => {
    // Twelve of the fourteen tickets share one createdAt, so the tie group
    // straddles the page boundary. Without a secondary key the database is
    // free to order ties differently per query, and a row can then appear on
    // two pages while another appears on none (BR-18).
    const seen: number[] = [];
    for (const page of [1, 2]) {
      const res = await list(requesterA, { page, pageSize: 10, sort: "createdAt", order: "desc" });
      expect(res.status).toBe(200);
      seen.push(...res.body.data.map((t: any) => t.id));
    }

    expect(seen).toHaveLength(14);
    expect(new Set(seen).size).toBe(14);

    // Absence of duplicates is necessary but not sufficient: at this data size
    // PostgreSQL happens to return a consistent order even with no secondary
    // key, so that assertion alone passes whether or not the key is present.
    // This asserts the tie-break directly — within the tied group the ids must
    // descend, which is only true because `id: "desc"` is applied.
    const tied = await list(requesterA, {
      pageSize: 50,
      sort: "createdAt",
      order: "desc",
      q: "Shared tie summary",
    });
    const tiedIds: number[] = tied.body.data.map((t: any) => t.id);
    expect(tiedIds).toHaveLength(12);
    expect(tiedIds).toEqual([...tiedIds].sort((x, y) => y - x));
  });

  it("returns an empty page beyond the last one", async () => {
    const res = await list(requesterA, { page: 99, pageSize: 10 });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(14);
  });
});

describe("GET /api/tickets — attachment count", () => {
  it("API-32: counts only active attachments", async () => {
    const ticket = await seedTicket(requesterA, {
      ticketNumber: "TKT-2026-970001",
      summary: "Ticket used for attachment counting",
    });
    await prisma.attachment.createMany({
      data: [
        {
          ticketId: ticket.id,
          originalFilename: "active.png",
          storedFilename: `${randomUUID()}.png`,
          mimeType: "image/png",
          sizeBytes: 1024,
          uploadedByRequesterId: requesterA,
        },
        {
          ticketId: ticket.id,
          originalFilename: "removed.png",
          storedFilename: `${randomUUID()}.png`,
          mimeType: "image/png",
          sizeBytes: 1024,
          uploadedByRequesterId: requesterA,
          removedAt: new Date(),
          removedByRequesterId: requesterA,
          removalReason: "Uploaded the wrong file",
        },
      ],
    });

    const res = await list(requesterA, { q: "attachment counting" });

    expect(res.status).toBe(200);
    expect(res.body.data[0].attachmentCount).toBe(1);

    await prisma.attachment.deleteMany({ where: { ticketId: ticket.id } });
    await prisma.ticket.delete({ where: { id: ticket.id } });
  });
});

describe("GET /api/tickets — invalid parameters", () => {
  it("UNIT-02 / API-28: rejects a page size outside the permitted set", async () => {
    const res = await list(requesterA, { pageSize: 7 });

    // Rejected, not silently clamped: a specified 400 is testable, a silent
    // substitution is not (BR-20).
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("API-29: rejects page 0, since pages are numbered from 1", async () => {
    const res = await list(requesterA, { page: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("API-30: rejects a sort field outside the whitelist", async () => {
    const res = await list(requesterA, { sort: "password" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects an unknown order direction", async () => {
    const res = await list(requesterA, { order: "sideways" });

    expect(res.status).toBe(400);
  });

  it("rejects an unknown priority", async () => {
    const res = await list(requesterA, { priority: "CRITICAL" });

    expect(res.status).toBe(400);
  });

  it("UNIT-02: applies defaults when no parameters are supplied", async () => {
    const res = await list(requesterA);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
  });
});

describe("GET /api/tickets — requester identity", () => {
  it("rejects a request with no identity header", async () => {
    const res = await request(app).get("/api/tickets");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("REQUESTER_HEADER_MISSING");
  });
});
