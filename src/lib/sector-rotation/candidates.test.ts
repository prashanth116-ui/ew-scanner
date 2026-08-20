import { describe, it, expect } from "vitest";
import { formatRotationChanges } from "./transitions";
import type { RotationChange } from "./transitions";

/**
 * These guard a naming bug that produced a genuinely misleading alert.
 *
 * `{qualified, total}` was called "breadth" and printed as "N/M stocks qualify (Broad —
 * wide participation)". It is not breadth: the count EXCLUDES names gapping >= 8%, so it
 * falls when a sector strengthens. On 2026-08-19 MRNA's +177% reduced the biotech figure
 * while actual biotech breadth was 82% and rising.
 */

const change = (over: Partial<RotationChange> = {}): RotationChange => ({
  type: "new_rotation",
  sectorName: "Biotech",
  etf: "XBI",
  startDate: "2026-08-19",
  daysActive: 1,
  lifecycle: "EARLY",
  conviction: "HIGH",
  quadrant: "IMPROVING",
  candidates: { tradeable: 8, tracked: 10 },
  ...over,
}) as RotationChange;

describe("tradeable-candidate line", () => {
  const render = (c: RotationChange) => formatRotationChanges([c], "2026-08-20T03:00:00Z");

  it("reports the count as tradeable, not as breadth or participation", () => {
    const out = render(change());
    expect(out).toContain("8/10 tradeable");
    // The words that would invert the meaning.
    expect(out).not.toMatch(/breadth/i);
    expect(out).not.toMatch(/participation/i);
    expect(out).not.toMatch(/\bBroad\b/);
    expect(out).not.toMatch(/\bNarrow\b/);
  });

  it("describes a high ratio as actionable rather than as a strong rotation", () => {
    // "strong rotation" was the old wording and it is a claim this number cannot support.
    const out = render(change({ candidates: { tradeable: 9, tracked: 10 } }));
    expect(out).toContain("actionable");
    expect(out).not.toMatch(/strong rotation/i);
  });

  it("attributes a low ratio to exclusions, not to a weak sector", () => {
    const out = render(change({ candidates: { tradeable: 2, tracked: 10 } }));
    expect(out).toMatch(/thin|few names/i);
  });

  it("names gapping and AVOID as the reason names drop out", () => {
    // The mid band is where the explanation matters most — a reader seeing 5/10 should
    // not conclude half the sector is weak.
    const out = render(change({ candidates: { tradeable: 4, tracked: 10 } }));
    expect(out).toMatch(/gapping|AVOID/);
  });

  it("omits the line for an ended rotation", () => {
    const out = render(change({ type: "rotation_ended" }));
    expect(out).not.toContain("tradeable");
  });

  it("does not divide by zero when nothing is tracked", () => {
    const out = render(change({ candidates: { tradeable: 0, tracked: 0 } }));
    expect(out).toContain("0/0");
    expect(out).not.toContain("NaN");
  });
});
