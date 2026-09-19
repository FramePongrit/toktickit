import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request, { type Response } from "supertest";
import { app } from "../testApp.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/security/password.js";
import { loginAs, TEST_PASSWORD, withAuth, type AuthSessionFixture } from "../support/auth.js";

const prisma = getPrisma();
const suiteTag = randomUUID().slice(0, 8);
const queuePrefix = `Q55-${suiteTag}`;
const passwordHashPromise = hashPassword(TEST_PASSWORD);

let categoryOneId: number;
let categoryTwoId: number;
let requesterAlphaId: number;
let requesterBetaId: number;
let requesterGammaId: number;
let staffAdaId: number;
let staffAdaDuplicateId: number;
let staffZedId: number;
let inactiveStaffId: number;
let requesterRoleId: number;
let adminId: number;
let staffAuth: AuthSessionFixture;
let adminAuth: AuthSessionFixture;
let requesterAuth: AuthSessionFixture;
const ticketIds: number[] = [];
const userIds: number[] = [];

type TicketFixture = {
  label: string;
  requesterId: number;
  ownerId: number | null;
  categoryId: number;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "REOPENED" | "RESOLVED" | "CLOSED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
  summary: string;
  indicated?: boolean;
};

const fixtureSpecs: TicketFixture[] = [
  { label: "A", requesterId: 0, ownerId: 0, categoryId: 0, priority: "URGENT", status: "OPEN", createdAt: "2026-01-01T01:00:00.000Z", updatedAt: "2026-02-01T01:00:00.000Z", summary: "Alpha queue ticket" , indicated: true },
  { label: "B", requesterId: 1, ownerId: 1, categoryId: 1, priority: "URGENT", status: "OPEN", createdAt: "2026-01-01T01:00:00.000Z", updatedAt: "2026-02-02T01:00:00.000Z", summary: "Beta queue ticket" },
  { label: "C", requesterId: 2, ownerId: null, categoryId: 0, priority: "HIGH", status: "IN_PROGRESS", createdAt: "2026-01-02T01:00:00.000Z", updatedAt: "2026-02-03T01:00:00.000Z", summary: "Gamma queue ticket" },
  { label: "D", requesterId: 0, ownerId: 0, categoryId: 1, priority: "HIGH", status: "RESOLVED", createdAt: "2026-01-03T01:00:00.000Z", updatedAt: "2026-02-04T01:00:00.000Z", summary: "Alpha resolved ticket" },
  { label: "E", requesterId: 1, ownerId: 2, categoryId: 0, priority: "MEDIUM", status: "NEW", createdAt: "2026-01-04T01:00:00.000Z", updatedAt: "2026-02-05T01:00:00.000Z", summary: "Beta medium ticket" },
  { label: "F", requesterId: 2, ownerId: 1, categoryId: 1, priority: "MEDIUM", status: "CLOSED", createdAt: "2026-01-05T01:00:00.000Z", updatedAt: "2026-02-06T01:00:00.000Z", summary: "Gamma closed ticket" },
  { label: "G", requesterId: 0, ownerId: 0, categoryId: 0, priority: "LOW", status: "WAITING_FOR_REQUESTER", createdAt: "2026-01-06T01:00:00.000Z", updatedAt: "2026-02-07T01:00:00.000Z", summary: "Alpha waiting ticket" },
  { label: "H", requesterId: 1, ownerId: 1, categoryId: 1, priority: "LOW", status: "CANCELLED", createdAt: "2026-01-07T01:00:00.000Z", updatedAt: "2026-02-08T01:00:00.000Z", summary: "Beta cancelled ticket" },
  { label: "I", requesterId: 2, ownerId: 1, categoryId: 0, priority: "HIGH", status: "REOPENED", createdAt: "2026-01-08T01:00:00.000Z", updatedAt: "2026-02-09T01:00:00.000Z", summary: "Gamma reopened ticket" },
  { label: "J", requesterId: 0, ownerId: 0, categoryId: 0, priority: "URGENT", status: "OPEN", createdAt: "2026-01-01T01:00:00.000Z", updatedAt: "2026-02-10T01:00:00.000Z", summary: "Alpha urgent tie ticket" },
  { label: "K", requesterId: 1, ownerId: null, categoryId: 1, priority: "MEDIUM", status: "OPEN", createdAt: "2026-01-10T01:00:00.000Z", updatedAt: "2026-02-11T01:00:00.000Z", summary: "Beta unassigned ticket" },
  { label: "L", requesterId: 2, ownerId: 1, categoryId: 0, priority: "LOW", status: "OPEN", createdAt: "2026-01-11T01:00:00.000Z", updatedAt: "2026-02-12T01:00:00.000Z", summary: "Gamma low ticket" },
];

function safeError(response: Response, status: number, code = "VALIDATION_FAILED") {
  expect(response.status).toBe(status);
  expect(response.body.error.code).toBe(code);
  expect(response.body.error.message).not.toMatch(/password|hash|SELECT|D:\\|stack/i);
}

type QueryValue = string | number | undefined;

function queue(auth: AuthSessionFixture, query: Record<string, QueryValue> = {}) {
  return withAuth(request(app).get("/api/staff/tickets").query(query), auth, false);
}

async function responseIds(auth: AuthSessionFixture, query: Record<string, QueryValue> = {}) {
  const response = await queue(auth, { q: queuePrefix, ...query });
  expect(response.status).toBe(200);
  return response.body.data.map((ticket: { id: number }) => ticket.id) as number[];
}

beforeAll(async () => {
  const [categoryOne, categoryTwo] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { active: true }, orderBy: { id: "asc" } }),
    prisma.category.findFirstOrThrow({ where: { active: true }, orderBy: { id: "desc" } }),
  ]);
  categoryOneId = categoryOne.id;
  categoryTwoId = categoryTwo.id;
  const passwordHash = await passwordHashPromise;
  const [alpha, beta, gamma, ada, adaDuplicate, zed, inactive, requester, admin] = await Promise.all([
    prisma.user.create({ data: { fullName: `Queue Alpha Requester ${suiteTag}`, email: `queue.alpha.${suiteTag}@example.test`, passwordHash } }),
    prisma.user.create({ data: { fullName: `Queue Beta Requester ${suiteTag}`, email: `queue.beta.${suiteTag}@example.test`, passwordHash } }),
    prisma.user.create({ data: { fullName: `Queue Gamma Requester ${suiteTag}`, email: `queue.gamma.${suiteTag}@example.test`, passwordHash } }),
    prisma.user.create({ data: { fullName: `Queue Ada Staff ${suiteTag}`, email: `queue.ada.${suiteTag}@example.test`, role: "STAFF", passwordHash } }),
    prisma.user.create({ data: { fullName: `queue ada staff ${suiteTag}`, email: `queue.ada.duplicate.${suiteTag}@example.test`, role: "STAFF", passwordHash } }),
    prisma.user.create({ data: { fullName: `Queue Zed Staff ${suiteTag}`, email: `queue.zed.${suiteTag}@example.test`, role: "STAFF", passwordHash } }),
    prisma.user.create({ data: { fullName: `Queue Inactive Staff ${suiteTag}`, email: `queue.inactive.${suiteTag}@example.test`, role: "STAFF", active: false, passwordHash } }),
    prisma.user.create({ data: { fullName: `Queue Requester Role ${suiteTag}`, email: `queue.requester.${suiteTag}@example.test`, passwordHash } }),
    prisma.user.create({ data: { fullName: `Queue Admin ${suiteTag}`, email: `queue.admin.${suiteTag}@example.test`, role: "ADMIN", passwordHash } }),
  ]);
  requesterAlphaId = alpha.id;
  requesterBetaId = beta.id;
  requesterGammaId = gamma.id;
  staffAdaId = ada.id;
  staffAdaDuplicateId = adaDuplicate.id;
  staffZedId = zed.id;
  inactiveStaffId = inactive.id;
  requesterRoleId = requester.id;
  adminId = admin.id;
  userIds.push(alpha.id, beta.id, gamma.id, ada.id, adaDuplicate.id, zed.id, inactive.id, requester.id, admin.id);

  staffAuth = await loginAs(ada.email);
  adminAuth = await loginAs(admin.email);
  requesterAuth = await loginAs(alpha.email);

  const requesterIds = [requesterAlphaId, requesterBetaId, requesterGammaId];
  const ownerIds = [staffAdaId, staffZedId, adminId, null];
  for (const spec of fixtureSpecs) {
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `${queuePrefix}-${spec.label}`,
        requesterId: requesterIds[spec.requesterId],
        ownerId: spec.ownerId === null ? null : ownerIds[spec.ownerId] as number,
        categoryId: spec.categoryId === 0 ? categoryOneId : categoryTwoId,
        relatedSystemId: (await prisma.relatedSystem.findFirstOrThrow({ where: { active: true } })).id,
        requestedPriority: spec.priority,
        itPriority: spec.priority,
        currentStatus: spec.status,
        summary: `${spec.summary} ${queuePrefix}`,
        description: "Issue 55 queue fixture description.",
        createdAt: new Date(spec.createdAt),
        updatedAt: new Date(spec.updatedAt),
        ...(spec.indicated && {
          resolutionIndicatedAt: new Date("2026-03-01T00:00:00.000Z"),
          resolutionIndicatedById: requesterAlphaId,
        }),
      },
    });
    ticketIds.push(ticket.id);
  }
});

afterAll(async () => {
  await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("Issue #55 — Staff Ticket Queue API", () => {
  it("API-Q01: permits Staff/Admin and denies unauthenticated Requester access", async () => {
    safeError(await request(app).get("/api/staff/tickets"), 401, "UNAUTHENTICATED");
    safeError(await queue(requesterAuth), 403, "FORBIDDEN");
    expect((await queue(staffAuth, { q: queuePrefix })).status).toBe(200);
    expect((await queue(adminAuth, { q: queuePrefix })).status).toBe(200);
  });

  it("API-Q01: searches Ticket Number, Summary, Requester name, and Requester email case-insensitively after trimming", async () => {
    const byNumber = await responseIds(staffAuth, { q: `  ${queuePrefix}-A  `.toLowerCase() });
    const bySummary = await responseIds(staffAuth, { q: `  URGENT TIE  ` });
    const byName = await responseIds(staffAuth, { q: `  ALPHA REQUESTER ${suiteTag}  `, scope: "all", pageSize: 50 });
    const byEmail = await responseIds(staffAuth, { q: `  QUEUE.ALPHA.${suiteTag}  `, scope: "all", pageSize: 50 });
    expect(byNumber).toEqual([ticketIds[0]]);
    expect(bySummary).toEqual([ticketIds[9]]);
    expect(byName).toEqual([ticketIds[0], ticketIds[9], ticketIds[3], ticketIds[6]]);
    expect(byEmail).toEqual([ticketIds[0], ticketIds[9], ticketIds[3], ticketIds[6]]);
  });

  it("API-Q01: applies status, IT Priority, category, owner, unassigned, me, and AND filters", async () => {
    expect(await responseIds(staffAuth, { status: "OPEN" })).toEqual([ticketIds[0], ticketIds[1], ticketIds[9], ticketIds[10], ticketIds[11]]);
    expect(await responseIds(staffAuth, { itPriority: "HIGH", scope: "all" })).toEqual([ticketIds[2], ticketIds[3], ticketIds[8]]);
    expect(await responseIds(staffAuth, { categoryId: categoryTwoId, scope: "all" })).toEqual([ticketIds[1], ticketIds[3], ticketIds[5], ticketIds[10], ticketIds[7]]);
    expect(await responseIds(staffAuth, { owner: "unassigned" })).toEqual([ticketIds[2], ticketIds[10]]);
    expect(await responseIds(staffAuth, { owner: "me" })).toEqual([ticketIds[0], ticketIds[9], ticketIds[6]]);
    expect(await responseIds(staffAuth, { owner: String(staffZedId) })).toEqual([ticketIds[1], ticketIds[8], ticketIds[11]]);
    expect(await responseIds(staffAuth, { status: "OPEN", itPriority: "URGENT", categoryId: categoryOneId, owner: String(staffAdaId) })).toEqual([ticketIds[0], ticketIds[9]]);
  });

  it("API-Q02: defaults to active scope and includes all statuses only when requested", async () => {
    const active = await responseIds(staffAuth);
    expect(active).toHaveLength(9);
    expect(active).not.toEqual(expect.arrayContaining([ticketIds[3], ticketIds[5], ticketIds[7]]));

    const all = await responseIds(staffAuth, { scope: "all", pageSize: 50 });
    expect(all).toHaveLength(12);
    expect(all).toEqual(expect.arrayContaining([ticketIds[3], ticketIds[5], ticketIds[7]]));
  });

  it("API-Q02: uses documented default priority order and deterministic ID tie-breakers", async () => {
    const ids = await responseIds(staffAuth);
    expect(ids).toEqual([
      ticketIds[0], ticketIds[1], ticketIds[9],
      ticketIds[2], ticketIds[8],
      ticketIds[4], ticketIds[10],
      ticketIds[6], ticketIds[11],
    ]);
  });

  it("API-Q02: supports every sort field and direction with fixed secondary keys", async () => {
    const sorts = [
      ["itPriority", "asc", [ticketIds[6], ticketIds[11], ticketIds[4], ticketIds[10], ticketIds[2], ticketIds[8], ticketIds[0], ticketIds[1], ticketIds[9]]],
      ["itPriority", "desc", [ticketIds[0], ticketIds[1], ticketIds[9], ticketIds[2], ticketIds[8], ticketIds[4], ticketIds[10], ticketIds[6], ticketIds[11]]],
      ["createdAt", "asc", [ticketIds[0], ticketIds[1], ticketIds[9], ticketIds[2], ticketIds[4], ticketIds[6], ticketIds[8], ticketIds[10], ticketIds[11]]],
      ["createdAt", "desc", [ticketIds[11], ticketIds[10], ticketIds[8], ticketIds[6], ticketIds[4], ticketIds[2], ticketIds[0], ticketIds[1], ticketIds[9]]],
      ["updatedAt", "asc", [ticketIds[0], ticketIds[1], ticketIds[2], ticketIds[4], ticketIds[6], ticketIds[8], ticketIds[9], ticketIds[10], ticketIds[11]]],
      ["updatedAt", "desc", [ticketIds[11], ticketIds[10], ticketIds[9], ticketIds[8], ticketIds[6], ticketIds[4], ticketIds[2], ticketIds[1], ticketIds[0]]],
      ["ticketNumber", "asc", [ticketIds[0], ticketIds[1], ticketIds[2], ticketIds[4], ticketIds[6], ticketIds[8], ticketIds[9], ticketIds[10], ticketIds[11]]],
      ["ticketNumber", "desc", [ticketIds[11], ticketIds[10], ticketIds[9], ticketIds[8], ticketIds[6], ticketIds[4], ticketIds[2], ticketIds[1], ticketIds[0]]],
      ["status", "asc", [ticketIds[4], ticketIds[0], ticketIds[1], ticketIds[9], ticketIds[10], ticketIds[11], ticketIds[2], ticketIds[6], ticketIds[8]]],
      ["status", "desc", [ticketIds[8], ticketIds[6], ticketIds[2], ticketIds[0], ticketIds[1], ticketIds[9], ticketIds[10], ticketIds[11], ticketIds[4]]],
    ] as const;
    for (const [sort, order, expected] of sorts) {
      expect(await responseIds(staffAuth, { sort, order })).toEqual(expected);
    }
  });

  it("API-Q02: paginates one-based with only 10/20/50 and reports empty metadata", async () => {
    const pageOne = await queue(staffAuth, { q: queuePrefix, scope: "all", pageSize: 10, page: 1 });
    const pageTwo = await queue(staffAuth, { q: queuePrefix, scope: "all", pageSize: 10, page: 2 });
    expect(pageOne.body).toMatchObject({ page: 1, pageSize: 10, total: 12, totalPages: 2 });
    expect(pageOne.body.data).toHaveLength(10);
    expect(pageTwo.body).toMatchObject({ page: 2, pageSize: 10, total: 12, totalPages: 2 });
    expect(pageTwo.body.data).toHaveLength(2);
    for (const pageSize of [20, 50]) {
      const response = await queue(staffAuth, { q: queuePrefix, scope: "all", pageSize });
      expect(response.body).toMatchObject({ page: 1, pageSize, total: 12, totalPages: 1 });
      expect(response.body.data).toHaveLength(12);
    }
    const empty = await queue(staffAuth, { q: "no-ticket-matches-this-value" });
    expect(empty.body).toEqual({ data: [], page: 1, pageSize: 10, total: 0, totalPages: 0 });
  });

  it("API-Q03: returns the exact safe active eligible Owner directory and rejects query parameters", async () => {
    const response = await withAuth(request(app).get("/api/staff/ticket-owners"), staffAuth, false);
    expect(response.status).toBe(200);
    const expected = await prisma.user.findMany({
      where: { active: true, role: { in: ["STAFF", "ADMIN"] } },
      select: { id: true, fullName: true, role: true },
    });
    expected.sort((left, right) => left.fullName.toLocaleLowerCase().localeCompare(right.fullName.toLocaleLowerCase()) || left.id - right.id);
    expect(response.body.data).toEqual(expected);
    expect(response.body.data.every((owner: Record<string, unknown>) => Object.keys(owner).sort().join(",") === "fullName,id,role")).toBe(true);
    expect(response.body.data.map((owner: { id: number }) => owner.id)).toContain(staffAdaId);
    expect(response.body.data.map((owner: { id: number }) => owner.id)).toContain(staffAdaDuplicateId);
    expect(response.body.data.map((owner: { id: number }) => owner.id)).not.toContain(inactiveStaffId);
    expect(response.body.data.map((owner: { id: number }) => owner.id)).not.toContain(requesterRoleId);
    safeError(await withAuth(request(app).get("/api/staff/ticket-owners").query({ q: "anything" }), staffAuth, false), 400);
    safeError(await withAuth(request(app).get("/api/staff/ticket-owners").query({ page: 1 }), requesterAuth, false), 403, "FORBIDDEN");
  });

  it("API-Q03: rejects malformed, absent, inactive, and wrong-Role numeric owners generically", async () => {
    for (const owner of ["0", "-1", "not-an-owner", "999999", String(inactiveStaffId), String(requesterRoleId)]) {
      const response = await queue(staffAuth, { q: queuePrefix, owner });
      safeError(response, 400);
      expect(response.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ field: "owner" })]));
    }
  });

  it("API-Q02/API-Q03: rejects unsupported values without clamping and keeps the response row safe", async () => {
    for (const query of [
      { q: "x".repeat(101) },
      { page: 0 },
      { pageSize: 7 },
      { status: "BROKEN" },
      { itPriority: "CRITICAL" },
      { scope: "closed" },
      { sort: "summary" },
      { order: "sideways" },
      { categoryId: 0 },
      { unknown: "not-supported" },
    ]) {
      safeError(await queue(staffAuth, { q: queuePrefix, ...query }), 400);
    }

    const response = await queue(staffAuth, { q: ` ${queuePrefix}-A ` });
    expect(Object.keys(response.body.data[0]).sort()).toEqual([
      "category",
      "createdAt",
      "currentStatus",
      "id",
      "itPriority",
      "owner",
      "requester",
      "requestedPriority",
      "resolutionIndication",
      "summary",
      "ticketNumber",
      "updatedAt",
    ].sort());
    expect(JSON.stringify(response.body)).not.toContain("Internal Note");
    expect(JSON.stringify(response.body)).not.toContain("description");
    expect(response.body.data[0].resolutionIndication).toMatchObject({ indicatedBy: { id: requesterAlphaId } });
  });

  it("API-Q01: rejects a supplied whitespace-only q with a field-level validation error", async () => {
    const response = await queue(staffAuth, { q: "   " });
    safeError(response, 400);
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "q" })])
    );
  });
});
