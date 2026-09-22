import { describe, it, expect } from "vitest";
import { formatRotationTurns, buildTurnMembers, formatRotationConfluence } from "./transitions";
import type { RotationSnapshot, RotationTopStock } from "./transitions";
import { rotationAgeSessions, turnCorroboratesRotation } from "./rotation-turn-view";
import { focusSectorEtfs, MIN_FOCUS_MEMBERS, FOCUS_LIST } from "@/data/focus-list";
import { SECTOR_UNIVERSE } from "@/data/sector-universe";
import type { RotationTurn } from "./rotation-turn";

const base: RotationTurn = {
  stage: "NONE",
  direction: "UP",
  rsLowDate: null,
  legLowDate: null,
  formingDate: null,
  barsSinceForming: null,
  turnDate: null,
  confirmedDate: null,
  quadrantDate: null,
  barsSinceTurn: null,
  quadrantLagBars: null,
  quadrantAlreadyAligned: false,
  heldSessions: 0,
  priorFailedAttempts: 0,
  stale: false,
  distanceFromFastPct: 0,
};

const AT = "2026-09-16T23:00:00.000Z";

describe("focusSectorEtfs", () => {
  it("scopes to baskets holding enough focus names to be actionable", () => {
    const all = focusSectorEtfs(SECTOR_UNIVERSE, 1);
    const scoped = focusSectorEtfs(SECTOR_UNIVERSE);
    // The point of the threshold: "holds any focus name" barely filters anything, which
    // is why MIN_FOCUS_MEMBERS is 4 and not 1.
    expect(scoped.size).toBeLessThan(all.size);
    expect(scoped.size).toBeGreaterThan(0);
    expect(scoped.size).toBeLessThan(SECTOR_UNIVERSE.length);
    // SMH is the motivating basket and must survive any sane threshold.
    expect(scoped.has("SMH")).toBe(true);
  });

  it("scopes across basket CATEGORIES, not just GICS sectors", () => {
    // The hazard this guards: SectorRotationResult splits baskets across `sectors`,
    // `subSectorScores`, `crossAssetScores` and `leadershipBasketScores`. The confluence
    // route first passed only `sectors`, which silently dropped AIQ, ARKX and ITA — a
    // quarter of the focus scope — so they could never fire an alert, and left AIQ out of
    // the standing-leaders ranking. If the scope spans categories, the caller must too.
    const scoped = focusSectorEtfs(SECTOR_UNIVERSE);
    const categoriesInScope = new Set(
      SECTOR_UNIVERSE.filter((b) => scoped.has(b.etf)).map((b) => b.category),
    );
    expect(categoriesInScope.size).toBeGreaterThan(1);
    expect(categoriesInScope.has("gics_sector")).toBe(true);
    expect(categoriesInScope.has("sub_sector")).toBe(true);
  });

  it("counts basket membership, not canonical ownership", () => {
    // A name listed in several baskets makes all of them relevant — a turn in any basket
    // holding it is a turn in something you trade.
    const multi = SECTOR_UNIVERSE.filter((b) => b.stocks.some((s) => FOCUS_LIST.has(s.symbol)));
    expect(multi.length).toBeGreaterThan(focusSectorEtfs(SECTOR_UNIVERSE).size);
  });

  it("respects an explicit threshold", () => {
    const strict = focusSectorEtfs(SECTOR_UNIVERSE, 100);
    expect(strict.size).toBe(0);
    expect(MIN_FOCUS_MEMBERS).toBeGreaterThan(1);
  });
});

describe("formatRotationTurns", () => {
  const focus = new Set(["SMH", "XLK", "IGV"]);

  it("returns null when nothing fired tonight", () => {
    const msg = formatRotationTurns(
      [{ sector: "Semiconductors", etf: "SMH", quadrant: "WEAKENING" as const, rotationTurn: { ...base, stage: "QUADRANT_CONFIRMED", turnDate: "2026-08-01", barsSinceTurn: 30 } }],
      focus,
      AT,
    );
    expect(msg).toBeNull();
  });

  it("lists a forming turn dated to this session, with the no-edge caveat", () => {
    const msg = formatRotationTurns(
      [{
        sector: "Semiconductors", etf: "SMH", quadrant: "WEAKENING" as const,
        rotationTurn: { ...base, stage: "TURN_FORMING", formingDate: "2026-09-16", barsSinceForming: 0, rsLowDate: "2026-09-14", priorFailedAttempts: 4, distanceFromFastPct: -0.73 },
      }],
      focus,
      AT,
    );
    expect(msg).toContain("FORMING");
    expect(msg).toContain("Semiconductors");
    expect(msg).toContain("2026-09-14");
    expect(msg).toContain("4 prior reclaims failed");
    // The caveat is not decoration — the measurement says this stage has no edge.
    expect(msg).toContain("Watchlist — no measured edge until the reclaim");
  });

  it("does not re-send a forming run from an earlier session", () => {
    const msg = formatRotationTurns(
      [{ sector: "Semiconductors", etf: "SMH", quadrant: "WEAKENING" as const, rotationTurn: { ...base, stage: "TURN_FORMING", formingDate: "2026-09-14", barsSinceForming: 2 } }],
      focus,
      AT,
    );
    expect(msg).toBeNull();
  });

  it("reports standing forming runs as a count beside tonight's new ones", () => {
    const msg = formatRotationTurns(
      [
        { sector: "Semiconductors", etf: "SMH", quadrant: "WEAKENING" as const, rotationTurn: { ...base, stage: "TURN_FORMING", formingDate: "2026-09-16", barsSinceForming: 0, distanceFromFastPct: -0.7 } },
        { sector: "Technology", etf: "XLK", quadrant: "WEAKENING" as const, rotationTurn: { ...base, stage: "TURN_FORMING", formingDate: "2026-09-11", barsSinceForming: 3, distanceFromFastPct: -1.2 } },
      ],
      focus,
      AT,
    );
    expect(msg).toContain("Semiconductors");
    expect(msg).not.toContain("Technology");
    expect(msg).toContain("1 other basket still forming");
  });

  it("lists a reclaim dated to this session under TURNED", () => {
    const msg = formatRotationTurns(
      [{
        sector: "Semiconductors", etf: "SMH", quadrant: "WEAKENING" as const,
        rotationTurn: { ...base, stage: "TURN_DETECTED", turnDate: "2026-09-17", barsSinceTurn: 0, rsLowDate: "2026-09-14", priorFailedAttempts: 4 },
      }],
      focus,
      AT,
    );
    expect(msg).toContain("TURNED TONIGHT");
    expect(msg).toContain("ahead of the quadrant");
  });

  it("ignores baskets outside the focus scope", () => {
    const msg = formatRotationTurns(
      [{ sector: "Utilities", etf: "XLU", quadrant: "WEAKENING" as const, rotationTurn: { ...base, stage: "TURN_FORMING", formingDate: "2026-09-16", barsSinceForming: 0 } }],
      focus,
      AT,
    );
    expect(msg).toBeNull();
  });

  it("ignores a downside turn — this alert is about rotation IN", () => {
    const msg = formatRotationTurns(
      [{
        sector: "Semiconductors", etf: "SMH", quadrant: "WEAKENING" as const,
        rotationTurn: { ...base, stage: "TURN_DETECTED", direction: "DOWN", turnDate: "2026-09-16", barsSinceTurn: 0 },
      }],
      focus,
      AT,
    );
    expect(msg).toBeNull();
  });

  it("separates a lead-bearing turn from a no-lead re-entry, and ranks lead first", () => {
    // This is the defect the first live send exposed: IGV and XLC went out looking like
    // SMH-grade calls when the quadrant had never left the bullish bucket and the 6 PM
    // alert already covered them. Lead has to be the sort key and has to be in words.
    const msg = formatRotationTurns(
      [
        {
          sector: "Software & Cloud", etf: "XLK", quadrant: "LEADING" as const,
          rotationTurn: { ...base, stage: "TURN_DETECTED", turnDate: "2026-09-21", barsSinceTurn: 0, quadrantAlreadyAligned: true, quadrantDate: "2026-07-27", distanceFromFastPct: 0.9 },
        },
        {
          sector: "Semiconductors", etf: "SMH", quadrant: "WEAKENING" as const,
          rotationTurn: { ...base, stage: "TURN_DETECTED", turnDate: "2026-09-21", barsSinceTurn: 0, quadrantAlreadyAligned: false, distanceFromFastPct: 0.8 },
        },
      ],
      focus,
      AT,
    ) as string;

    expect(msg).toContain("ahead of the quadrant");
    expect(msg).toContain("RE-ENTRIES");
    // The lead-bearing sector must appear above the no-lead one regardless of input order.
    expect(msg.indexOf("Semiconductors")).toBeLessThan(msg.indexOf("Software & Cloud"));
    // And the reason must be spelled out, not left as a field name.
    expect(msg).toContain("quadrant never left the bucket");
    expect(msg).toContain("quadrant still WEAKENING");
  });

  it("omits the divider when there is nothing above it", () => {
    const msg = formatRotationTurns(
      [{
        sector: "Software & Cloud", etf: "XLK", quadrant: "LEADING" as const,
        rotationTurn: { ...base, stage: "TURN_DETECTED", turnDate: "2026-09-21", barsSinceTurn: 0, quadrantAlreadyAligned: true, quadrantDate: "2026-07-27" },
      }],
      focus,
      AT,
    ) as string;
    expect(msg).toContain("RE-ENTRIES");
    expect(msg).not.toContain("────────────────────");
  });

  it("always shows standing leadership so tonight's fires are not read as a ranking", () => {
    // The misread this prevents, from the real 2026-09-21 board: IGV and XLC were the only
    // fires, both no-lead re-entries and both NEGATIVE vs SPY over five sessions, while
    // SMH led at +8.4% and was absent because its 09-17 turn was no longer new. Without
    // the footer the message reads as "money left semis for software".
    const msg = formatRotationTurns(
      [
        {
          sector: "Software & Cloud", etf: "IGV", quadrant: "LEADING" as const, mansfieldRS: 5.9,
          rotationTurn: { ...base, stage: "TURN_DETECTED", turnDate: "2026-09-21", barsSinceTurn: 0, quadrantAlreadyAligned: true, quadrantDate: "2026-07-27" },
        },
        {
          sector: "Semiconductors", etf: "SMH", quadrant: "LEADING" as const, mansfieldRS: 13.8,
          rotationTurn: { ...base, stage: "QUADRANT_CONFIRMED", turnDate: "2026-09-17", barsSinceTurn: 2 },
        },
        {
          sector: "Technology", etf: "XLK", quadrant: "LEADING" as const, mansfieldRS: 11.4,
          rotationTurn: { ...base, stage: "QUADRANT_CONFIRMED", turnDate: "2026-09-04", barsSinceTurn: 11 },
        },
      ],
      new Set(["IGV", "SMH", "XLK"]),
      AT,
    ) as string;

    expect(msg).toContain("Standing leaders");
    // SMH leads the footer even though it did not fire tonight — that is the entire point.
    expect(msg).toContain("SMH +13.8");
    expect(msg.indexOf("SMH +13.8")).toBeLessThan(msg.indexOf("XLK +11.4"));
    expect(msg).toContain("not where the money is");
  });

  it("omits the leadership footer when too few sectors carry an RS reading", () => {
    const msg = formatRotationTurns(
      [{
        sector: "Semiconductors", etf: "SMH", quadrant: "WEAKENING" as const,
        rotationTurn: { ...base, stage: "TURN_DETECTED", turnDate: "2026-09-17", barsSinceTurn: 0 },
      }],
      focus,
      AT,
    ) as string;
    expect(msg).not.toContain("Standing leaders");
  });

  it("gives a re-entry a header plus the ticker row, and no prose", () => {
    // Detail budget scales with lead. A re-entry has none, the header already says so, and
    // the first cut spent six lines per entry restating the heading.
    const msg = formatRotationTurns(
      [{
        sector: "Software & Cloud", etf: "IGV", quadrant: "LEADING" as const, mansfieldRS: 5.9,
        rotationTurn: { ...base, stage: "TURN_CONFIRMED", turnDate: "2026-09-21", barsSinceTurn: 0, quadrantAlreadyAligned: true, quadrantDate: "2026-07-27", confirmedDate: "2026-09-21", priorFailedAttempts: 4, distanceFromFastPct: 0.9 },
        focusMembers: [
          { symbol: "TEAM", pctFromSma50: 33.6 },
          { symbol: "OKTA", pctFromSma50: 24.3 },
          { symbol: "ZS", pctFromSma50: -2.0 },
        ],
      }],
      focus,
      AT,
    ) as string;

    const header = msg.split("\n").filter((l) => l.includes("IGV"));
    expect(header).toHaveLength(1);
    expect(header[0]).toContain("reclaimed 2026-09-21");
    expect(header[0]).toContain("2/3 above their 50d");

    // The tickers stay. They are the only actionable part of a re-entry: "IGV reclaimed
    // its 20d" is not a decision, "TEAM +33.6% and ZS below its 50d" is.
    expect(msg).toContain("✓TEAM +33.6%");
    expect(msg).toContain("·ZS -2.0%");

    // The prose does not — every line below restated the section heading.
    expect(msg).not.toContain("prior reclaims failed");
    expect(msg).not.toContain("A dip inside an existing trend");
    expect(msg).not.toContain("Your names —");
  });

  it("puts the rotation lifecycle on the turn line so it cannot read as a contradiction", () => {
    // The message showed IGV as a fresh reclaim at the top and "Day 39 | LATE" forty lines
    // below in the confluence body. Both are true - an old rotation dipped and bounced -
    // but split apart they read as two opposing claims about the same basket.
    const msg = formatRotationTurns(
      [{
        sector: "Software & Cloud", etf: "IGV", quadrant: "LEADING" as const, mansfieldRS: 5.9,
        lifecycle: "LATE", daysActive: 39,
        rotationTurn: { ...base, stage: "TURN_CONFIRMED", turnDate: "2026-09-21", barsSinceTurn: 0, quadrantAlreadyAligned: true, quadrantDate: "2026-07-27" },
        focusMembers: [{ symbol: "TEAM", pctFromSma50: 33.6 }],
      }],
      focus,
      AT,
    ) as string;
    const header = msg.split("\n").find((l) => l.includes("IGV")) as string;
    expect(header).toContain("reclaimed 2026-09-21");
    expect(header).toContain("Day 39 LATE");
  });

  it("omits the lifecycle tag when the basket has no tracked rotation", () => {
    const msg = formatRotationTurns(
      [{
        sector: "Semiconductors", etf: "SMH", quadrant: "WEAKENING" as const,
        rotationTurn: { ...base, stage: "TURN_DETECTED", turnDate: "2026-09-17", barsSinceTurn: 0 },
      }],
      focus,
      AT,
    ) as string;
    expect(msg).not.toContain("Day ");
  });

  it("promotes and marks scanner-flagged names so the two lists agree", () => {
    // The confusion this fixes: the turn block ranked IGV by 50d distance
    // (TEAM/OKTA/ZS/TWLO/NET/CRWD) while the confluence body below listed only
    // scanner-flagged names (SHOP/PLTR/SNOW/WDAY/DDOG). All ten were focus names; the
    // lists just answered different questions and said so nowhere.
    const msg = formatRotationTurns(
      [{
        sector: "Software & Cloud", etf: "IGV", quadrant: "LEADING" as const,
        rotationTurn: { ...base, stage: "TURN_DETECTED", turnDate: "2026-09-21", barsSinceTurn: 0 },
        focusMembers: [
          { symbol: "TEAM", pctFromSma50: 33.6 },
          { symbol: "OKTA", pctFromSma50: 24.3 },
          { symbol: "PLTR", pctFromSma50: 4.0 },
        ],
      }],
      focus,
      AT,
      new Set(["PLTR"]),
    ) as string;

    // PLTR is weakest on trend but carries a scanner hit, so it leads and is marked.
    const row = msg.split("\n").find((l) => l.includes("PLTR")) as string;
    expect(row.indexOf("PLTR")).toBeLessThan(row.indexOf("TEAM"));
    expect(msg).toContain("PLTR +4.0%⚡");
    expect(msg).toContain("also flagged by a scanner tonight");
  });

  it("marks nothing and prints no legend when no scanner hits are supplied", () => {
    const msg = formatRotationTurns(
      [{
        sector: "Software & Cloud", etf: "IGV", quadrant: "LEADING" as const,
        rotationTurn: { ...base, stage: "TURN_DETECTED", turnDate: "2026-09-21", barsSinceTurn: 0 },
        focusMembers: [{ symbol: "TEAM", pctFromSma50: 33.6 }],
      }],
      focus,
      AT,
    ) as string;
    expect(msg).not.toContain("⚡");
    expect(msg).not.toContain("also flagged by a scanner");
  });

  it("names the focus members inside a turning basket", () => {
    const msg = formatRotationTurns(
      [{
        sector: "Semiconductors", etf: "SMH", quadrant: "WEAKENING" as const,
        rotationTurn: { ...base, stage: "TURN_DETECTED", turnDate: "2026-09-17", barsSinceTurn: 0, distanceFromFastPct: 0.8 },
        focusMembers: [
          { symbol: "NVDA", pctFromSma50: 6.1 },
          { symbol: "AVGO", pctFromSma50: 4.8 },
          { symbol: "MU", pctFromSma50: -1.2 },
        ],
      }],
      focus,
      AT,
    ) as string;
    expect(msg).toContain("NVDA");
    expect(msg).toContain("2/3 above their 50d");
    expect(msg).toContain("✓NVDA +6.1%");
    expect(msg).toContain("·MU -1.2%");
  });

  it("marks an unmeasurable member as unknown rather than weak", () => {
    const msg = formatRotationTurns(
      [{
        sector: "Semiconductors", etf: "SMH", quadrant: "WEAKENING" as const,
        rotationTurn: { ...base, stage: "TURN_DETECTED", turnDate: "2026-09-17", barsSinceTurn: 0 },
        focusMembers: [
          { symbol: "NVDA", pctFromSma50: 3 },
          { symbol: "XYZ", pctFromSma50: null },
        ],
      }],
      focus,
      AT,
    ) as string;
    // 1 of 1 MEASURED, not 1 of 2 — a name we could not read must not count as a fail.
    expect(msg).toContain("1/1 above their 50d");
    expect(msg).toContain("?XYZ");
  });
});

describe("buildTurnMembers", () => {
  it("keeps only focus names and ranks them by distance above their 50d", () => {
    const universe = [{ etf: "SMH", stocks: [{ symbol: "NVDA" }, { symbol: "AVGO" }, { symbol: "NOTFOCUS" }] }];
    const m = buildTurnMembers(universe, new Set(["NVDA", "AVGO"]), {
      NVDA: { pctFromSma50: 4 },
      AVGO: { pctFromSma50: -1 },
    });
    const smh = m.get("SMH") as { symbol: string; pctFromSma50: number | null }[];
    // Strongest first. Ranking by rsAccel instead put the most DAMAGED name on top —
    // that spread rewards being far below the 200d, which is the bug this guards.
    expect(smh.map((x) => x.symbol)).toEqual(["NVDA", "AVGO"]);
  });

  it("reports a missing quote as null, not as below the 50d", () => {
    const universe = [{ etf: "SMH", stocks: [{ symbol: "NVDA" }] }];
    const m = buildTurnMembers(universe, new Set(["NVDA"]), {});
    const smh = m.get("SMH") as { pctFromSma50: number | null }[];
    expect(smh[0].pctFromSma50).toBeNull();
  });
});
describe("formatRotationConfluence — dual clocks", () => {
  const rot: RotationSnapshot = {
    sectorId: "semiconductors", sectorName: "Semiconductors", etf: "SMH",
    lifecycle: "EARLY", conviction: "HIGH", quadrant: "LEADING",
    daysActive: 1, startDate: "2026-09-21",
  };
  const stock = {
    symbol: "MRVL", performancePct: 0, rsAcceleration: 1, rsDelta: 1, trendAccel: null,
    dailyChangePct: 0, aboveSma50: true, volumeVsAvg: 1, volumeConsistency: 3,
    isTurnaroundCandidate: false, category: "leading" as const,
    scannerHits: [{ scanner: "Trans", detail: "TRIGGERED" }],
  } as RotationTopStock;
  const stocks = new Map([["semiconductors", [stock]]]);

  it("annotates Day N with the RS turn date when one exists", () => {
    // The question this answers: SMH read "Day 1" from a 2026-09-21 signal-count start
    // while its RS line turned on 09-17. One number cannot carry both facts.
    const msg = formatRotationConfluence(
      [rot], stocks, "2026-09-22T03:00:00.000Z", [],
      new Map([["SMH", { ...base, stage: "TURN_CONFIRMED", turnDate: "2026-09-17", barsSinceTurn: 4 }]]),
    ) as string;
    expect(msg).toContain("Day 1");
    expect(msg).toContain("RS turned 2026-09-17 (4d)");
  });

  it("falls back to the forming date when no reclaim has printed", () => {
    const msg = formatRotationConfluence(
      [rot], stocks, "2026-09-22T03:00:00.000Z", [],
      new Map([["SMH", { ...base, stage: "TURN_FORMING", formingDate: "2026-09-16", barsSinceForming: 1 }]]),
    ) as string;
    expect(msg).toContain("RS forming since 2026-09-16 (1d)");
  });

  it("renders unchanged when no turn data is supplied", () => {
    // Back-compat: the 6 PM alert route calls this without turns.
    const msg = formatRotationConfluence([rot], stocks, "2026-09-22T03:00:00.000Z", []) as string;
    expect(msg).toContain("Day 1");
    expect(msg).not.toContain("RS turned");
  });
});

describe("rotation age and corroboration", () => {
  it("takes the longer clock when the signal detector was late", () => {
    // SMH on 2026-09-22: tracker said Day 1, RS had turned on 09-17 (barsSinceTurn 2).
    expect(rotationAgeSessions(1, { ...base, direction: "UP", turnDate: "2026-09-17", barsSinceTurn: 2 })).toBe(3);
  });

  it("leaves the day count alone when the tracker fired first", () => {
    // XLK: started 08-13, turned 09-04. The tracker is the earlier clock, so nothing moves.
    expect(rotationAgeSessions(27, { ...base, direction: "UP", turnDate: "2026-09-04", barsSinceTurn: 11 })).toBe(27);
  });

  it("falls back to the forming date before a reclaim prints", () => {
    expect(rotationAgeSessions(1, { ...base, stage: "TURN_FORMING", direction: "UP", formingDate: "2026-09-16", barsSinceForming: 3 })).toBe(4);
  });

  it("ignores a downside turn and a missing turn", () => {
    expect(rotationAgeSessions(2, { ...base, direction: "DOWN", turnDate: "2026-09-17", barsSinceTurn: 9 })).toBe(2);
    expect(rotationAgeSessions(2, null)).toBe(2);
  });

  it("corroborates only a confirmed upside turn", () => {
    // A bare reclaim carries no measured edge, so it must not waive the blip filter.
    expect(turnCorroboratesRotation({ ...base, direction: "UP", stage: "TURN_DETECTED" })).toBe(false);
    expect(turnCorroboratesRotation({ ...base, direction: "UP", stage: "TURN_FORMING" })).toBe(false);
    expect(turnCorroboratesRotation({ ...base, direction: "UP", stage: "TURN_CONFIRMED" })).toBe(true);
    expect(turnCorroboratesRotation({ ...base, direction: "UP", stage: "QUADRANT_CONFIRMED" })).toBe(true);
    expect(turnCorroboratesRotation({ ...base, direction: "DOWN", stage: "QUADRANT_CONFIRMED" })).toBe(false);
    expect(turnCorroboratesRotation(null)).toBe(false);
  });
});
