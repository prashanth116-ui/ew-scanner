import { describe, it, expect } from "vitest";
import { isLoadedSpring, springRank, LOADED_SPRING } from "./loaded-spring";

/** MRNA on 2026-08-19 — the name this screen was built from. */
const MRNA = { runnerScore: 76, seScore: 38, demandScore: 20, extensionRisk: false, isCoiled: false };

describe("isLoadedSpring", () => {
  it("catches MRNA the day before it gapped 117%", () => {
    // Runner 76 with clean air overhead, sellers finished at 38, and demand at 20 —
    // enormous stored energy and nothing pulling it. The whole point of the screen.
    expect(isLoadedSpring(MRNA)).toBe(true);
  });

  it("excludes a name that already has demand — that is COILED, not loaded", () => {
    expect(isLoadedSpring({ ...MRNA, demandScore: 45 })).toBe(false);
    expect(isLoadedSpring({ ...MRNA, isCoiled: true })).toBe(false);
  });

  it("excludes a name that has already moved", () => {
    // Extension means the energy was spent. Nothing left to position ahead of.
    expect(isLoadedSpring({ ...MRNA, extensionRisk: true })).toBe(false);
  });

  it("excludes a quiet stock with no room to run", () => {
    // Low demand alone is not interesting — most of the universe is quiet. Runner is
    // what separates a loaded spring from a stock nobody wants for good reason.
    expect(isLoadedSpring({ ...MRNA, runnerScore: 30 })).toBe(false);
  });

  it("excludes a name whose sellers are not finished", () => {
    expect(isLoadedSpring({ ...MRNA, seScore: 20 })).toBe(false);
  });

  it("keeps the SE bar below 40 so MRNA at 38 still qualifies", () => {
    // Raising MIN_SE to 40 would have excluded the exact name this exists for.
    expect(LOADED_SPRING.MIN_SE).toBeLessThanOrEqual(38);
  });

  it("cannot overlap COILED — its demand bar is the coiled bar", () => {
    expect(LOADED_SPRING.MAX_DEMAND).toBe(38);
  });
});

describe("null handling", () => {
  it("fails on unmeasured components rather than bypassing them", () => {
    // Opposite of the focus predicate, deliberately: an unmeasured component is not
    // evidence of stored energy, and treating null as passing would fill the screen
    // with thin-data rows.
    expect(isLoadedSpring({ ...MRNA, runnerScore: null })).toBe(false);
    expect(isLoadedSpring({ ...MRNA, seScore: null })).toBe(false);
    expect(isLoadedSpring({ ...MRNA, demandScore: null })).toBe(false);
    expect(isLoadedSpring({})).toBe(false);
  });
});

describe("springRank", () => {
  it("ranks more room above more exhaustion", () => {
    // Among names that all lack a trigger, the one with the most room is worth
    // researching first.
    expect(springRank({ runnerScore: 76, seScore: 38 }))
      .toBeGreaterThan(springRank({ runnerScore: 60, seScore: 57 }));
  });

  it("breaks ties on seller exhaustion", () => {
    expect(springRank({ runnerScore: 60, seScore: 45 }))
      .toBeGreaterThan(springRank({ runnerScore: 60, seScore: 35 }));
  });
});
