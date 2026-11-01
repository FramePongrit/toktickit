import { describe, expect, it } from "vitest";
import { fromBangkokDateTimeLocal, toBangkokDateTimeLocal } from "../../src/lib/bangkokDateTime.js";

describe("Bangkok Action date-time conversion", () => {
  it("formats and parses a datetime-local value as UTC+07 independent of browser timezone", () => {
    expect(toBangkokDateTimeLocal("2026-10-29T02:15:00.000Z")).toBe("2026-10-29T09:15");
    expect(fromBangkokDateTimeLocal("2026-10-29T09:15")).toBe("2026-10-29T02:15:00.000Z");
    expect(fromBangkokDateTimeLocal("2026-03-08T02:30")).toBe("2026-03-07T19:30:00.000Z");
  });

  it("rejects malformed or impossible local values", () => {
    expect(fromBangkokDateTimeLocal("not-a-date")).toBeNull();
    expect(fromBangkokDateTimeLocal("2026-02-30T10:00")).toBeNull();
  });
});
