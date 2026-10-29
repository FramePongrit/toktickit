import { describe, expect, it } from "vitest";
import { dashboardWindow, hrefWithResolvedWindow, hrefWithWindow } from "../../src/lib/dashboardRules.js";
import { listTicketsQuerySchema, staffActionsQuerySchema, staffQueueQuerySchema } from "../../src/lib/validation.js";

describe("Issue #89 dashboard and query rules", () => {
  it("uses the inclusive seven-day Bangkok calendar window across date/year boundaries", () => {
    expect(dashboardWindow(new Date("2026-10-23T04:00:00.000Z"))).toEqual({
      timeZone: "Asia/Bangkok",
      from: "2026-10-16T17:00:00.000Z",
      through: "2026-10-23T04:00:00.000Z",
    });
    expect(dashboardWindow(new Date("2026-01-01T16:59:59.000Z")).from).toBe("2025-12-25T17:00:00.000Z");
    expect(dashboardWindow(new Date("2026-01-01T17:00:00.000Z")).from).toBe("2025-12-26T17:00:00.000Z");
  });

  it("builds allowlisted, encoded drill-down links with the metric's exact bounds", () => {
    expect(hrefWithWindow("/tickets", "2026-10-16T17:00:00.000Z", "2026-10-23T04:00:00.000Z"))
      .toBe("/tickets?updatedFrom=2026-10-16T17%3A00%3A00.000Z&updatedThrough=2026-10-23T04%3A00%3A00.000Z&sort=updatedAt&order=desc");
    expect(hrefWithResolvedWindow("2026-10-16T17:00:00.000Z", "2026-10-23T04:00:00.000Z"))
      .toContain("statuses=RESOLVED%2CCLOSED&resolvedFrom=");
  });

  it("validates distinct status/priority sets, inclusive offset bounds and conflicting filters", () => {
    expect(listTicketsQuerySchema.safeParse({ statuses: "OPEN,RESOLVED", updatedFrom: "2026-10-16T17:00:00+07:00", resolvedThrough: "2026-10-23T11:00:00+07:00" }).success).toBe(true);
    for (const query of [
      { statuses: "" },
      { statuses: "OPEN,OPEN" },
      { statuses: "NOT_A_STATUS" },
      { statuses: "OPEN", status: "OPEN" },
      { itPriorities: "HIGH" },
      { unknown: "value" },
      { resolvedFrom: "2026-10-24T00:00:00Z", resolvedThrough: "2026-10-23T00:00:00Z" },
      { updatedFrom: "2026-10-23T00:00:00" },
    ]) expect(listTicketsQuerySchema.safeParse(query).success).toBe(false);

    expect(staffQueueQuerySchema.safeParse({ itPriorities: "HIGH,URGENT", statuses: "OPEN,IN_PROGRESS" }).success).toBe(true);
    expect(staffQueueQuerySchema.safeParse({ itPriority: "HIGH", itPriorities: "HIGH" }).success).toBe(false);
    expect(staffQueueQuerySchema.safeParse({ sort: "priorityRecent" }).data?.order).toBe("desc");
  });

  it("requires a complete date window only for completed-performed Actions", () => {
    expect(staffActionsQuerySchema.safeParse({}).success).toBe(true);
    expect(staffActionsQuerySchema.safeParse({ view: "active-assigned", from: "2026-10-23T00:00:00Z" }).success).toBe(false);
    expect(staffActionsQuerySchema.safeParse({ view: "completed-performed", from: "2026-10-23T00:00:00Z" }).success).toBe(false);
    expect(staffActionsQuerySchema.safeParse({ view: "completed-performed", from: "2026-10-24T00:00:00Z", through: "2026-10-23T00:00:00Z" }).success).toBe(false);
  });
});
