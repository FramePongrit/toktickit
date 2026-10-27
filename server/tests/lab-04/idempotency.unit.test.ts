import { describe, expect, it } from "vitest";
import { canonicalRequestJson, digestRequestBody, requireIdempotencyKey } from "../../src/lib/idempotency.js";

describe("UNIT-06 — idempotency identity", () => {
  it("canonicalizes object property ordering but retains supplied values and omissions", () => {
    const first = { expectedTicketVersion: 3, description: "Inspect", optional: null };
    const reordered = { optional: null, description: "Inspect", expectedTicketVersion: 3 };
    expect(canonicalRequestJson(first)).toBe(canonicalRequestJson(reordered));
    expect(digestRequestBody(first)).toBe(digestRequestBody(reordered));
    expect(digestRequestBody({ expectedTicketVersion: 3, description: "Inspect" })).not.toBe(digestRequestBody(first));
    expect(digestRequestBody({ ...first, expectedTicketVersion: 4 })).not.toBe(digestRequestBody(first));
  });

  it("accepts only UUID v4 request keys and normalizes their case", () => {
    const key = "550E8400-E29B-41D4-A716-446655440000";
    expect(requireIdempotencyKey(key)).toBe(key.toLowerCase());
    expect(() => requireIdempotencyKey(undefined)).toThrow();
    expect(() => requireIdempotencyKey("550e8400-e29b-11d4-a716-446655440000")).toThrow();
  });
});
