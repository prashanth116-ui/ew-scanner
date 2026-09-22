import { describe, it, expect } from "vitest";
import { computeBriefRsTurns, rsTurnEtfs } from "./brief";
import type { SectorRotationResult, SectorRotationScore } from "./types";
import type { RotationTurn } from "./rotation-turn";

const turn = (o: Partial<RotationTurn>): RotationTurn => ({
  stage: "NONE", direction: "UP",
  rsLowDate: null, legLowDate: null, formingDate: null, barsSinceForming: null,
  turnDate: null, confirmedDate: null, quadrantDate: null,
  barsSinceTurn: null, quadrantLagBars: null, quadrantAlreadyAligned: false,
  heldSessions: 0, priorFailedAttempts: 0, stale: false, distanceFromFastPct: 0,
  ...o,
});

const sector = (etf: string, name: string, t: RotationTurn | null, quadrant = "WEAKENING"): SectorRotationScore =>
  ({ sector: name, etf, quadrant, rotationTurn: t } as unknown as SectorRotationScore);

const result = (sectors: SectorRotationScore[], extra: Partial<SectorRotationResult> = {}): SectorRotationResult =>
  ({ sectors, ...extra } as unknown as SectorRotationResult);

describe("computeBriefRsTurns", () => {
  it("reports a reclaim inside the window", () => {
    const out = computeBriefRsTurns(result([
      sector("SMH", "Semiconductors", turn({ stage: "TURN_CONFIRMED", turnDate: "2026-09-17", barsSinceTurn: 1, rsLowDate: "2026-09-14" })),
    ]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ etf: "SMH", kind: "turned", date: "2026-09-17", barsAgo: 1, rsLowDate: "2026-09-14" });
  });

  it("reports a forming run, which is the 09-16 state", () => {
    const out = computeBriefRsTurns(result([
      sector("SMH", "Semiconductors", turn({ stage: "TURN_FORMING", formingDate: "2026-09-16", barsSinceForming: 0, rsLowDate: "2026-09-14" })),
    ]));
    expect(out[0]).toMatchObject({ kind: "forming", date: "2026-09-16", barsAgo: 0 });
    // Forming must never claim a quadrant lag — there is no turn yet to be late to.
    expect(out[0].quadrantLagBars).toBeNull();
  });

  it("drops turns older than the window", () => {
    expect(computeBriefRsTurns(result([
      sector("SMH", "Semiconductors", turn({ stage: "QUADRANT_CONFIRMED", turnDate: "2026-08-01", barsSinceTurn: 30 })),
    ]))).toHaveLength(0);
  });

  it("ignores downside turns and sectors with none", () => {
    expect(computeBriefRsTurns(result([
      sector("XLE", "Energy", turn({ stage: "TURN_DETECTED", direction: "DOWN", turnDate: "2026-09-21", barsSinceTurn: 0 })),
      sector("XLU", "Utilities", null),
    ]))).toHaveLength(0);
  });

  it("spans every basket category, not just GICS sectors", () => {
    // Same hazard the confluence route hit: AIQ and ARKX live in subSectorScores.
    const out = computeBriefRsTurns(result(
      [sector("SMH", "Semiconductors", turn({ stage: "TURN_DETECTED", turnDate: "2026-09-17", barsSinceTurn: 0 }))],
      {
        subSectorScores: [sector("AIQ", "AI & Robotics", turn({ stage: "TURN_DETECTED", turnDate: "2026-09-17", barsSinceTurn: 0 }))],
        crossAssetScores: [sector("GLD", "Gold", turn({ stage: "TURN_DETECTED", turnDate: "2026-09-17", barsSinceTurn: 0 }))],
        leadershipBasketScores: [sector("QQQ", "Nasdaq 100", turn({ stage: "TURN_DETECTED", turnDate: "2026-09-17", barsSinceTurn: 0 }))],
      },
    ));
    expect(out.map((x) => x.etf).sort()).toEqual(["AIQ", "GLD", "QQQ", "SMH"]);
  });

  it("ranks lead-bearing turns above re-entries however recent the re-entry", () => {
    const out = computeBriefRsTurns(result([
      sector("IGV", "Software", turn({ stage: "TURN_CONFIRMED", turnDate: "2026-09-21", barsSinceTurn: 0, quadrantAlreadyAligned: true, quadrantDate: "2026-07-27" })),
      sector("SMH", "Semiconductors", turn({ stage: "TURN_DETECTED", turnDate: "2026-09-19", barsSinceTurn: 2 })),
    ]));
    // SMH is older but the quadrant has not caught up, so it leads. IGV is a dip-and-recover.
    expect(out.map((x) => x.etf)).toEqual(["SMH", "IGV"]);
    expect(out[1].alreadyAligned).toBe(true);
  });

  it("caps the list so a broad session cannot crowd out the rest of the brief", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      sector(`E${i}`, `S${i}`, turn({ stage: "TURN_DETECTED", turnDate: "2026-09-21", barsSinceTurn: 0 })),
    );
    expect(computeBriefRsTurns(result(many)).length).toBeLessThanOrEqual(5);
  });
});

describe("rsTurnEtfs", () => {
  it("lists the ETFs the quadrant-transition section must skip", () => {
    const turns = computeBriefRsTurns(result([
      sector("SMH", "Semiconductors", turn({ stage: "TURN_DETECTED", turnDate: "2026-09-17", barsSinceTurn: 0 })),
    ]));
    // Without this the brief prints "SMH turned 09-17" and "SMH WEAKENING -> LEADING" in
    // the same section, which reads as two separate events.
    expect(rsTurnEtfs(turns).has("SMH")).toBe(true);
    expect(rsTurnEtfs(turns).has("XLU")).toBe(false);
  });
});

describe("weak-basket suppression", () => {
  it("drops baskets measured never to lead anywhere", () => {
    // XLP produced ZERO turns with 3+ qualifying names in two years, across 17 turn
    // events. XLRE the same. The alert fires there and nothing ever comes of it.
    const out = computeBriefRsTurns(result([
      sector("XLP", "Consumer Staples", turn({ stage: "TURN_DETECTED", turnDate: "2026-09-17", barsSinceTurn: 0 })),
      sector("XLRE", "Real Estate", turn({ stage: "TURN_DETECTED", turnDate: "2026-09-17", barsSinceTurn: 0 })),
      sector("SMH", "Semiconductors", turn({ stage: "TURN_DETECTED", turnDate: "2026-09-17", barsSinceTurn: 0 })),
    ]));
    expect(out.map((x) => x.etf)).toEqual(["SMH"]);
  });

  it("keeps a basket that was never measured, since that is not evidence of failure", () => {
    // ARKX is absent from the stage-11 study (too few events), so it keeps its alert.
    const out = computeBriefRsTurns(result([], {
      subSectorScores: [sector("ARKX", "Space & Defense", turn({ stage: "TURN_DETECTED", turnDate: "2026-09-17", barsSinceTurn: 0 }))],
    }));
    expect(out.map((x) => x.etf)).toEqual(["ARKX"]);
  });

  it("suppresses the marginal baskets too, not just the dead ones", () => {
    // XLV 17%, XBI 14%, ITA 11%, IYT 16% — measured below the 20% bar.
    const out = computeBriefRsTurns(result([
      sector("XLV", "Health Care", turn({ stage: "TURN_DETECTED", turnDate: "2026-09-17", barsSinceTurn: 0 })),
      sector("XBI", "Biotech", turn({ stage: "TURN_DETECTED", turnDate: "2026-09-17", barsSinceTurn: 0 })),
      sector("IGV", "Software", turn({ stage: "TURN_DETECTED", turnDate: "2026-09-17", barsSinceTurn: 0 })),
    ]));
    expect(out.map((x) => x.etf)).toEqual(["IGV"]);
  });
});
