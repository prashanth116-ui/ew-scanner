import { describe, it, expect } from "vitest";
import { daysUntil, countdownLabel } from "@/lib/catalyst-date";

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("daysUntil", () => {
  it("counts whole days forward and back", () => {
    expect(daysUntil("2026-08-22", at("2026-08-19"))).toBe(3);
    expect(daysUntil("2026-08-19", at("2026-08-19"))).toBe(0);
    expect(daysUntil("2026-08-17", at("2026-08-19"))).toBe(-2);
  });

  it("does not drift across a month or year boundary", () => {
    expect(daysUntil("2026-09-01", at("2026-08-31"))).toBe(1);
    expect(daysUntil("2027-01-01", at("2026-12-31"))).toBe(1);
  });

  it("is unaffected by the time of day", () => {
    // A catalyst read at 23:50 must not report a different countdown than at 00:10.
    expect(daysUntil("2026-08-20", new Date("2026-08-19T23:50:00Z"))).toBe(1);
    expect(daysUntil("2026-08-20", new Date("2026-08-19T00:10:00Z"))).toBe(1);
  });

  it("handles a leap day", () => {
    expect(daysUntil("2028-03-01", at("2028-02-28"))).toBe(2);
  });
});

describe("countdownLabel", () => {
  it("reads as plain English at the boundaries", () => {
    expect(countdownLabel(0)).toBe("today");
    expect(countdownLabel(1)).toBe("tomorrow");
    expect(countdownLabel(4)).toBe("in 4d");
    expect(countdownLabel(-1)).toBe("yesterday");
    expect(countdownLabel(-3)).toBe("3d ago");
  });
});
