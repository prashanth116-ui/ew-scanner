import { describe, it, expect, vi, afterEach } from "vitest";

// The module is server-only and reaches Supabase; stub both so the reconciliation logic
// can be exercised without a database.
vi.mock("server-only", () => ({}));

const deleteChain = { eq: vi.fn(), gte: vi.fn(), lte: vi.fn(), select: vi.fn() };
const upsert = vi.fn().mockResolvedValue({ error: null });
const from = vi.fn(() => ({
  delete: () => {
    deleteChain.eq.mockReturnValue(deleteChain);
    deleteChain.gte.mockReturnValue(deleteChain);
    deleteChain.lte.mockReturnValue(deleteChain);
    deleteChain.select.mockResolvedValue({ data: [], error: null });
    return deleteChain;
  },
  upsert,
}));

vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ from }) }));

const { syncEarningsCatalysts, EARNINGS_SOURCE } = await import("./earnings-sync");

afterEach(() => { vi.restoreAllMocks(); upsert.mockClear(); });

function mockFeed(rows: { symbol: string; date: string; hour?: string }[]) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ earningsCalendar: rows }),
  }));
}

describe("syncEarningsCatalysts", () => {
  it("refuses to sync the whole universe when given no tickers", async () => {
    // A universe-wide sync would badge 42 names and bury the alert in earnings season.
    process.env.FINNHUB_API_KEY = "k";
    const r = await syncEarningsCatalysts([]);
    expect(r.written).toBe(0);
    expect(r.errors[0]).toContain("refusing");
  });

  it("writes only tickers it was asked about", async () => {
    process.env.FINNHUB_API_KEY = "k";
    mockFeed([
      { symbol: "MRVL", date: "2026-08-27", hour: "amc" },
      { symbol: "NOTMINE", date: "2026-08-28" },
    ]);
    const r = await syncEarningsCatalysts(["MRVL"]);
    expect(r.fetched).toBe(2);
    expect(r.matched).toBe(1);
    const rows = upsert.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].ticker).toBe("MRVL");
  });

  it("keeps only the soonest date when a ticker appears twice", async () => {
    // A revised date leaves both in the feed; two badges would read as two events.
    process.env.FINNHUB_API_KEY = "k";
    mockFeed([
      { symbol: "CRM", date: "2026-09-02" },
      { symbol: "CRM", date: "2026-08-26" },
    ]);
    await syncEarningsCatalysts(["CRM"]);
    const rows = upsert.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].event_date).toBe("2026-08-26");
  });

  it("records the session, because an amc print gaps the next open", async () => {
    process.env.FINNHUB_API_KEY = "k";
    mockFeed([
      { symbol: "AVGO", date: "2026-09-02", hour: "amc" },
      { symbol: "CIEN", date: "2026-09-03", hour: "bmo" },
      { symbol: "DELL", date: "2026-09-03" },
    ]);
    await syncEarningsCatalysts(["AVGO", "CIEN", "DELL"]);
    const byTicker = Object.fromEntries(
      upsert.mock.calls[0][0].map((r: { ticker: string; note: string | null }) => [r.ticker, r.note]),
    );
    expect(byTicker.AVGO).toBe("After close");
    expect(byTicker.CIEN).toBe("Before open");
    expect(byTicker.DELL).toBeNull();
  });

  it("stamps rows as feed-owned so the syncer can never clobber a manual tag", async () => {
    process.env.FINNHUB_API_KEY = "k";
    mockFeed([{ symbol: "SNOW", date: "2026-09-02" }]);
    await syncEarningsCatalysts(["SNOW"]);
    expect(upsert.mock.calls[0][0][0].source).toBe(EARNINGS_SOURCE);
  });

  it("reports a feed failure instead of wiping existing tags", async () => {
    process.env.FINNHUB_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const r = await syncEarningsCatalysts(["MRVL"]);
    expect(r.errors[0]).toContain("429");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("does nothing without an API key", async () => {
    delete process.env.FINNHUB_API_KEY;
    const r = await syncEarningsCatalysts(["MRVL"]);
    expect(r.errors[0]).toContain("FINNHUB_API_KEY");
    expect(upsert).not.toHaveBeenCalled();
  });
});
