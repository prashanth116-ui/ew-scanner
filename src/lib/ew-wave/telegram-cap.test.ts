import { describe, it, expect } from "vitest";
import { capForTelegram } from "./telegram";

describe("capForTelegram", () => {
  it("leaves a normal-length message untouched", () => {
    const msg = "NIGHTLY SCAN\nsome lines\nmore lines";
    expect(capForTelegram(msg)).toBe(msg);
  });

  it("keeps an over-length message under Telegram's hard limit", () => {
    // Over 4096 the API rejects the send outright and the whole alert is lost — not
    // truncated, lost. That is the failure this guards.
    const msg = Array.from({ length: 400 }, (_, i) => `line ${i} of ticker detail`).join("\n");
    expect(msg.length).toBeGreaterThan(4096);
    expect(capForTelegram(msg).length).toBeLessThan(4096);
  });

  it("cuts at a line boundary rather than mid-word", () => {
    const msg = Array.from({ length: 400 }, (_, i) => `line ${i} of ticker detail`).join("\n");
    const out = capForTelegram(msg);
    const body = out.slice(0, out.lastIndexOf("\n"));
    // Every retained line should be a whole line from the original.
    for (const line of body.split("\n")) {
      expect(msg.split("\n")).toContain(line);
    }
  });

  it("says it trimmed, so a short message is never mistaken for a quiet night", () => {
    const msg = "x".repeat(5000);
    expect(capForTelegram(msg)).toContain("trimmed");
  });

  it("still trims when the message has no newline to cut on", () => {
    const msg = "x".repeat(5000);
    expect(capForTelegram(msg).length).toBeLessThan(4096);
  });
});
