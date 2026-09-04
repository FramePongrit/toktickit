import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import {
  formatTicketNumber,
  TICKET_NUMBER_PATTERN,
} from "../../src/services/ticketNumber.service.js";

const prisma = getPrisma();

// This suite creates its own requesters rather than using seeded ids, so it can
// delete exactly what it made and assert only about its own data. Suites share
// one development database (vitest.config.ts sets fileParallelism: false).
let activeRequesterId: number;
let inactiveRequesterId: number;
let categoryId: number;
let relatedSystemId: number;
let inactiveCategoryId: number;

const suiteTag = randomUUID();

function validBody() {
  return {
    categoryId,
    relatedSystemId,
    requestedPriority: "MEDIUM",
    summary: "Laptop battery drains quickly",
    description: "The battery drains much faster than usual even when the system is idle.",
  };
}

function post(body: object, requesterId: number | null = activeRequesterId) {
  const req = request(app).post("/api/tickets").send(body);
  return requesterId === null ? req : req.set("X-Requester-Id", String(requesterId));
}

/** Field names carried in a 400 VALIDATION_FAILED body. */
function invalidFields(body: any): string[] {
  return (body?.error?.details ?? []).map((d: { field: string }) => d.field);
}

beforeAll(async () => {
  const active = await prisma.requesterUser.create({
    data: { fullName: "Create Suite Active", email: `create-active-${suiteTag}@lab2.local`, active: true },
  });
  const inactive = await prisma.requesterUser.create({
    data: { fullName: "Create Suite Inactive", email: `create-inactive-${suiteTag}@lab2.local`, active: false },
  });
  activeRequesterId = active.id;
  inactiveRequesterId = inactive.id;

  const category = await prisma.category.findFirstOrThrow({ where: { active: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { active: true } });
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;

  // The seed has no inactive category, so API-10 makes its own. It is filtered
  // out of GET /api/categories, so the Lab 1 test that asserts the four active
  // categories is unaffected.
  const inactiveCategory = await prisma.category.create({
    data: { name: `Retired Category ${suiteTag}`, active: false },
  });
  inactiveCategoryId = inactiveCategory.id;
});

afterAll(async () => {
  // FK order: tickets before the requesters they point at.
  await prisma.ticket.deleteMany({
    where: { requesterId: { in: [activeRequesterId, inactiveRequesterId] } },
  });
  await prisma.requesterUser.deleteMany({
    where: { id: { in: [activeRequesterId, inactiveRequesterId] } },
  });
  await prisma.category.deleteMany({ where: { id: inactiveCategoryId } });
  await prisma.$disconnect();
});

describe("Ticket number formatting", () => {
  it("UNIT-01: pads the sequence to six digits", () => {
    expect(formatTicketNumber(2026, 42)).toBe("TKT-2026-000042");
    expect(formatTicketNumber(2026, 1)).toBe("TKT-2026-000001");
    expect(formatTicketNumber(2026, 123456)).toBe("TKT-2026-123456");
  });
});

describe("POST /api/tickets — success", () => {
  it("API-01: creates one ticket and returns its official number", async () => {
    const res = await post(validBody());

    expect(res.status).toBe(201);
    expect(res.body.ticketNumber).toMatch(TICKET_NUMBER_PATTERN);
    expect(res.body.summary).toBe("Laptop battery drains quickly");

    const saved = await prisma.ticket.findUnique({ where: { id: res.body.id } });
    expect(saved).not.toBeNull();
    expect(saved!.ticketNumber).toBe(res.body.ticketNumber);
  });

  it("API-02: defaults the status to NEW and owns the ticket to the caller", async () => {
    const res = await post(validBody());

    expect(res.status).toBe(201);
    expect(res.body.currentStatus).toBe("NEW");
    expect(res.body.requester.id).toBe(activeRequesterId);

    const saved = await prisma.ticket.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(saved.currentStatus).toBe("NEW");
    expect(saved.requesterId).toBe(activeRequesterId);
  });

  it("API-03: numbers the ticket for the current year", async () => {
    const res = await post(validBody());

    expect(res.status).toBe(201);
    expect(res.body.ticketNumber).toMatch(TICKET_NUMBER_PATTERN);
    expect(res.body.ticketNumber.startsWith(`TKT-${new Date().getFullYear()}-`)).toBe(true);
  });

  it("API-11: ignores system-generated values supplied by the client", async () => {
    const res = await post({
      ...validBody(),
      ticketNumber: "TKT-1999-000001",
      currentStatus: "NEW",
      requesterId: inactiveRequesterId,
    });

    expect(res.status).toBe(201);
    expect(res.body.ticketNumber).not.toBe("TKT-1999-000001");
    expect(res.body.requester.id).toBe(activeRequesterId);
  });

  it("API-04: allocates distinct numbers under concurrent creation", async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => post(validBody()))
    );

    expect(responses.every((r) => r.status === 201)).toBe(true);

    const numbers = responses.map((r) => r.body.ticketNumber);
    expect(new Set(numbers).size).toBe(8);
  });
});

describe("POST /api/tickets — validation", () => {
  it("API-05: rejects a summary shorter than the minimum", async () => {
    const res = await post({ ...validBody(), summary: "help" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(invalidFields(res.body)).toContain("summary");
  });

  it("UNIT-04: trims before measuring length, so whitespace is not content", async () => {
    const res = await post({ ...validBody(), summary: "        " });

    expect(res.status).toBe(400);
    expect(invalidFields(res.body)).toContain("summary");
  });

  it("API-06: rejects a description shorter than the minimum", async () => {
    const res = await post({ ...validBody(), description: "too short" });

    expect(res.status).toBe(400);
    expect(invalidFields(res.body)).toContain("description");
  });

  it("API-07: rejects a summary longer than 200 characters", async () => {
    const res = await post({ ...validBody(), summary: "x".repeat(201) });

    expect(res.status).toBe(400);
    expect(invalidFields(res.body)).toContain("summary");
  });

  it("API-08: names every missing required field", async () => {
    const res = await post({});

    expect(res.status).toBe(400);
    expect(invalidFields(res.body)).toEqual(
      expect.arrayContaining([
        "categoryId",
        "relatedSystemId",
        "requestedPriority",
        "summary",
        "description",
      ])
    );
  });

  it("API-09: rejects a priority outside the permitted set", async () => {
    const res = await post({ ...validBody(), requestedPriority: "CRITICAL" });

    expect(res.status).toBe(400);
    expect(invalidFields(res.body)).toContain("requestedPriority");
  });

  it("API-10: treats an unknown category as a field error, not a missing resource", async () => {
    const res = await post({ ...validBody(), categoryId: 999_999 });

    // 400 rather than 404: the fault is in a submitted field value, so it
    // belongs with the other messages the form renders (BR-23, D-09).
    expect(res.status).toBe(400);
    expect(invalidFields(res.body)).toContain("categoryId");
  });

  it("API-10: treats an inactive category the same as an unknown one", async () => {
    const res = await post({ ...validBody(), categoryId: inactiveCategoryId });

    expect(res.status).toBe(400);
    expect(invalidFields(res.body)).toContain("categoryId");
  });

  it("API-10: rejects an unknown related system", async () => {
    const res = await post({ ...validBody(), relatedSystemId: 999_999 });

    expect(res.status).toBe(400);
    expect(invalidFields(res.body)).toContain("relatedSystemId");
  });

  it("saves nothing when validation fails", async () => {
    const before = await prisma.ticket.count({ where: { requesterId: activeRequesterId } });
    await post({ ...validBody(), summary: "no" });
    const after = await prisma.ticket.count({ where: { requesterId: activeRequesterId } });

    expect(after).toBe(before);
  });
});

describe("POST /api/tickets — requester identity", () => {
  it("API-12: rejects a request with no identity header", async () => {
    const res = await post(validBody(), null);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("REQUESTER_HEADER_MISSING");
  });

  it("API-13: rejects a malformed identity header", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("X-Requester-Id", "abc")
      .send(validBody());

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("REQUESTER_HEADER_INVALID");
  });

  it("API-14: rejects an identity that cannot be resolved", async () => {
    const res = await post(validBody(), 999_999);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("REQUESTER_NOT_FOUND");
  });

  it("API-15: refuses an inactive requester", async () => {
    const res = await post(validBody(), inactiveRequesterId);

    // 403, not 401: the identity resolved but is not permitted. Lab 3 needs the
    // same distinction for a valid token on a deactivated account.
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("REQUESTER_INACTIVE");
  });
});
