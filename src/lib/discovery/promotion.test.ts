import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock server-only (no-op in tests)
vi.mock("server-only", () => ({}));

// Mock Supabase admin client
const mockSelect = vi.fn();
const mockUpsert = vi.fn();
const mockDelete = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}));

import {
  promoteDiscoveredTickers,
  loadPromotedTickers,
  purgeExpiredPromotions,
} from "./promotion";
import type { PromotionCandidate } from "./promotion";

function makeCandidate(overrides: Partial<PromotionCandidate> = {}): PromotionCandidate {
  return {
    symbol: "ACME",
    name: "Acme Corp",
    assetClass: "stock",
    sector: "Technology",
    score: 16,
    verdict: "KEEP",
    ...overrides,
  };
}

describe("promoteDiscoveredTickers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 0 for empty candidates", async () => {
    const result = await promoteDiscoveredTickers([]);
    expect(result).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("upserts candidates and returns count", async () => {
    // First call: select existing scores
    const mockSelectChain = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    // Second call: upsert
    const mockUpsertChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({
        data: [{ id: "1" }, { id: "2" }],
        error: null,
      }),
    };

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? mockSelectChain : mockUpsertChain;
    });

    const candidates = [
      makeCandidate({ symbol: "ACME", score: 16 }),
      makeCandidate({ symbol: "BETA", score: 18, verdict: "PRIORITY" }),
    ];

    const result = await promoteDiscoveredTickers(candidates);

    expect(result).toBe(2);
    expect(mockFrom).toHaveBeenCalledWith("promoted_tickers");
    // Verify upsert was called with onConflict
    expect(mockUpsertChain.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ symbol: "ACME", best_score: 16 }),
        expect.objectContaining({ symbol: "BETA", best_score: 18 }),
      ]),
      { onConflict: "symbol,asset_class" }
    );
  });

  it("preserves higher best_score on re-promotion", async () => {
    // Existing record has score 20, new candidate has score 16
    const mockSelectChain = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [{ symbol: "ACME", best_score: 20 }],
        error: null,
      }),
    };
    const mockUpsertChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({
        data: [{ id: "1" }],
        error: null,
      }),
    };

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? mockSelectChain : mockUpsertChain;
    });

    await promoteDiscoveredTickers([makeCandidate({ symbol: "ACME", score: 16 })]);

    // best_score should be max(16, 20) = 20
    expect(mockUpsertChain.upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ symbol: "ACME", best_score: 20 })],
      { onConflict: "symbol,asset_class" }
    );
  });

  it("updates best_score when new score is higher", async () => {
    const mockSelectChain = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [{ symbol: "ACME", best_score: 14 }],
        error: null,
      }),
    };
    const mockUpsertChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({
        data: [{ id: "1" }],
        error: null,
      }),
    };

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? mockSelectChain : mockUpsertChain;
    });

    await promoteDiscoveredTickers([makeCandidate({ symbol: "ACME", score: 22 })]);

    expect(mockUpsertChain.upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ symbol: "ACME", best_score: 22 })],
      { onConflict: "symbol,asset_class" }
    );
  });

  it("returns 0 on Supabase error", async () => {
    const mockSelectChain = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const mockUpsertChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "DB error" },
      }),
    };

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? mockSelectChain : mockUpsertChain;
    });

    const result = await promoteDiscoveredTickers([makeCandidate()]);
    expect(result).toBe(0);
  });
});

describe("loadPromotedTickers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads non-expired promoted tickers", async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [
          { id: "1", symbol: "ACME", asset_class: "stock", best_score: 18 },
        ],
        error: null,
      }),
    };

    mockFrom.mockReturnValue(mockChain);

    const result = await loadPromotedTickers("stock");

    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe("ACME");
    expect(mockChain.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
    expect(mockChain.eq).toHaveBeenCalledWith("asset_class", "stock");
  });

  it("returns empty array on error", async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "DB error" },
      }),
    };

    mockFrom.mockReturnValue(mockChain);

    const result = await loadPromotedTickers();
    expect(result).toEqual([]);
  });
});

describe("purgeExpiredPromotions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes expired rows and returns count", async () => {
    const mockChain = {
      delete: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({
        data: [{ id: "1" }, { id: "2" }],
        error: null,
      }),
    };

    mockFrom.mockReturnValue(mockChain);

    const result = await purgeExpiredPromotions();

    expect(result).toBe(2);
    expect(mockFrom).toHaveBeenCalledWith("promoted_tickers");
    expect(mockChain.lt).toHaveBeenCalledWith("expires_at", expect.any(String));
  });

  it("returns 0 on error", async () => {
    const mockChain = {
      delete: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "DB error" },
      }),
    };

    mockFrom.mockReturnValue(mockChain);

    const result = await purgeExpiredPromotions();
    expect(result).toBe(0);
  });
});
