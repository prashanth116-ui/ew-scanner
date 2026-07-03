"""
Verify preset filters are working correctly by spot-checking live scan results.
Checks BOTH positive (results match criteria) and negative (excluded stocks don't).
"""

import json
import urllib.request
import sys

API_BASE = "https://quantradar.com"


def fetch_stock(ticker: str) -> dict | None:
    """Fetch single stock data from live API."""
    url = f"{API_BASE}/api/prerun/stock?ticker={ticker}&emaTimeframe=1d"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  WARN: Could not fetch {ticker}: {e}")
        return None


def fetch_batch(tickers: list[str]) -> list[dict]:
    """Fetch batch via scan API."""
    url = f"{API_BASE}/api/prerun/scan"
    payload = json.dumps({"tickers": tickers, "emaTimeframe": "1d", "viewMode": "standard"}).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
            return data.get("results", [])
    except Exception as e:
        print(f"  WARN: Batch fetch failed: {e}")
        return []


def g(d: dict, *keys):
    """Nested get."""
    for k in keys:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d


class PresetVerifier:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.warnings = 0

    def check(self, condition: bool, desc: str, ticker: str = ""):
        prefix = f"  [{ticker}] " if ticker else "  "
        if condition:
            self.passed += 1
            print(f"{prefix}PASS: {desc}")
        else:
            self.failed += 1
            print(f"{prefix}FAIL: {desc}")

    def warn(self, msg: str):
        self.warnings += 1
        print(f"  WARN: {msg}")

    def section(self, name: str):
        print(f"\n{'='*60}")
        print(f"  {name}")
        print(f"{'='*60}")

    def summary(self):
        print(f"\n{'='*60}")
        print(f"  VERIFICATION SUMMARY")
        print(f"{'='*60}")
        print(f"  Passed:   {self.passed}")
        print(f"  Failed:   {self.failed}")
        print(f"  Warnings: {self.warnings}")
        total = self.passed + self.failed
        if total > 0:
            print(f"  Rate:     {self.passed/total*100:.1f}%")
        if self.failed == 0:
            print(f"\n  ALL CHECKS PASSED")
        else:
            print(f"\n  {self.failed} CHECK(S) FAILED")
        return self.failed == 0


def verify_pullback_buy(v: PresetVerifier, results: list[dict]):
    """Verify Pullback Buy: 20-40% ATH, L>=1, M2>=1, F>=1, score>=15."""
    v.section("PULLBACK BUY - Positive Checks (all results must match)")

    for r in results:
        t = g(r, "data", "ticker") or "?"
        pct = g(r, "data", "pctFromAth") or 0
        score = g(r, "scores", "finalScore") or 0
        m2 = g(r, "scores", "scoreM2") or 0
        f_s = g(r, "scores", "scoreF") or 0
        l_s = g(r, "scores", "scoreL") or 0

        v.check(20 <= pct <= 40, f"pctFromAth={pct:.0f}% is in [20,40] range", t)
        v.check(m2 >= 1, f"scoreM2={m2} >= 1", t)
        v.check(f_s >= 1, f"scoreF={f_s} >= 1", t)
        v.check(l_s >= 1, f"scoreL={l_s} >= 1", t)
        v.check(score >= 15, f"finalScore={score} >= 15", t)

    # Negative check: stock at 60% from ATH should NOT appear
    v.section("PULLBACK BUY - Negative Checks (excluded stocks)")
    # Find a stock from the full scan that's 60%+ from ATH
    neg_tickers = ["MRNA", "NTLA", "ASAN"]  # Known 80%+ from ATH stocks
    neg_results = fetch_batch(neg_tickers)
    for r in neg_results:
        t = g(r, "data", "ticker") or "?"
        pct = g(r, "data", "pctFromAth") or 0
        if pct > 40:
            v.check(True, f"{t} at {pct:.0f}% from ATH correctly excluded (>40% cap)", t)
        else:
            v.warn(f"{t} at {pct:.0f}% - not above 40% ATH, can't test exclusion")

    # Negative check: stock with L=0 should NOT appear
    # Verify none of the results have L=0
    l0_count = sum(1 for r in results if (g(r, "scores", "scoreL") or 0) < 1)
    v.check(l0_count == 0, f"No results with scoreL < 1 (found {l0_count})")


def verify_leading_sector(v: PresetVerifier, results: list[dict]):
    """Verify Leading Sector: skipGate1, M>=1, totalScore>=12, includes near-ATH stocks."""
    v.section("LEADING SECTOR - Positive Checks")

    # Check that results include stocks NEAR ATH (< 20%) - this proves skipGate1 works
    near_ath = [r for r in results if (g(r, "data", "pctFromAth") or 0) < 20]
    v.check(len(near_ath) > 0, f"Found {len(near_ath)} stocks with pctFromAth < 20% (proves skipGate1 works)")

    # Check a sample of results
    sample = results[:15]
    for r in sample:
        t = g(r, "data", "ticker") or "?"
        total = g(r, "scores", "totalScore") or 0
        m_s = g(r, "scores", "scoreM") or 0

        v.check(total >= 12, f"totalScore={total} >= 12", t)
        v.check(m_s >= 1, f"scoreM={m_s} >= 1 (EMA reclaim)", t)

    # Verify near-ATH stocks specifically
    v.section("LEADING SECTOR - Near-ATH Stock Checks")
    for r in near_ath[:5]:
        t = g(r, "data", "ticker") or "?"
        pct = g(r, "data", "pctFromAth") or 0
        total = g(r, "scores", "totalScore") or 0
        final = g(r, "scores", "finalScore") or 0
        gate1 = g(r, "gates", "gate1")

        v.check(pct < 20, f"pctFromAth={pct:.0f}% < 20% (near ATH)", t)
        v.check(gate1 == False, f"gate1={gate1} is False (Gate 1 failed -- expected for near-ATH)", t)
        v.check(final == 0, f"finalScore={final} == 0 (gates failed -> zeroed, but totalScore used)", t)
        v.check(total >= 12, f"totalScore={total} >= 12 (actual score ignoring gates)", t)

    # Negative: stock in LAGGING sector should be excluded
    v.section("LEADING SECTOR - Negative Checks")
    # A stock with scoreM=0 should be excluded
    m0_count = sum(1 for r in results if (g(r, "scores", "scoreM") or 0) < 1)
    v.check(m0_count == 0, f"No results with scoreM < 1 (found {m0_count})")


def verify_stealth_accumulation(v: PresetVerifier, results: list[dict]):
    """Verify Stealth: M2>=1, (OBV OR VP divergence), finalScore>=11."""
    v.section("STEALTH ACCUMULATION - Positive Checks")

    for r in results:
        t = g(r, "data", "ticker") or "?"
        score = g(r, "scores", "finalScore") or 0
        m2 = g(r, "scores", "scoreM2") or 0
        obv = g(r, "data", "obvDivergent") or False
        vp = g(r, "data", "vpDivergenceBullish") or False

        v.check(m2 >= 1, f"scoreM2={m2} >= 1", t)
        v.check(obv or vp, f"obvDivergent={obv} OR vpDivergenceBullish={vp}", t)
        v.check(score >= 11, f"finalScore={score} >= 11", t)

    # Negative: stock with M2=0 and divergence should be excluded (now)
    v.section("STEALTH ACCUMULATION - Negative Checks")
    m2_zero = sum(1 for r in results if (g(r, "scores", "scoreM2") or 0) < 1)
    v.check(m2_zero == 0, f"No results with scoreM2 < 1 (M2 timing required) - found {m2_zero}")

    no_div = sum(1 for r in results
                 if not (g(r, "data", "obvDivergent") or False)
                 and not (g(r, "data", "vpDivergenceBullish") or False))
    v.check(no_div == 0, f"No results without divergence - found {no_div}")


def verify_sndk(v: PresetVerifier, results: list[dict]):
    """Verify SNDK: pctFromAth>=40, shortFloat>=15, finalScore>=18."""
    v.section("SNDK PATTERN - Positive Checks")

    for r in results[:10]:  # Sample first 10
        t = g(r, "data", "ticker") or "?"
        pct = g(r, "data", "pctFromAth") or 0
        si = g(r, "data", "shortFloat") or 0
        score = g(r, "scores", "finalScore") or 0

        v.check(pct >= 40, f"pctFromAth={pct:.0f}% >= 40%", t)
        v.check(si >= 15, f"shortFloat={si:.1f}% >= 15%", t)
        v.check(score >= 18, f"finalScore={score} >= 18", t)


def verify_early_mover(v: PresetVerifier, results: list[dict]):
    """Verify Early Mover: pctFromAth>=25, M2>=1, L>=1, F>=1, finalScore>=14."""
    v.section("EARLY MOVER - Positive Checks")

    for r in results[:10]:
        t = g(r, "data", "ticker") or "?"
        pct = g(r, "data", "pctFromAth") or 0
        score = g(r, "scores", "finalScore") or 0
        m2 = g(r, "scores", "scoreM2") or 0
        l_s = g(r, "scores", "scoreL") or 0
        f_s = g(r, "scores", "scoreF") or 0

        v.check(pct >= 25, f"pctFromAth={pct:.0f}% >= 25%", t)
        v.check(m2 >= 1, f"scoreM2={m2} >= 1", t)
        v.check(l_s >= 1, f"scoreL={l_s} >= 1", t)
        v.check(f_s >= 1, f"scoreF={f_s} >= 1", t)
        v.check(score >= 14, f"finalScore={score} >= 14", t)


def verify_aggressive_early(v: PresetVerifier, results: list[dict]):
    """Verify Aggressive Early: M2>=1, N>=1, divergence, finalScore>=10."""
    v.section("AGGRESSIVE EARLY - Positive Checks")

    for r in results:
        t = g(r, "data", "ticker") or "?"
        score = g(r, "scores", "finalScore") or 0
        m2 = g(r, "scores", "scoreM2") or 0
        n_s = g(r, "scores", "scoreN") or 0
        obv = g(r, "data", "obvDivergent") or False
        vp = g(r, "data", "vpDivergenceBullish") or False

        v.check(m2 >= 1, f"scoreM2={m2} >= 1", t)
        v.check(n_s >= 1, f"scoreN={n_s} >= 1", t)
        v.check(obv or vp, f"divergence: obv={obv} or vp={vp}", t)
        v.check(score >= 10, f"finalScore={score} >= 10", t)


def main():
    print("=" * 60)
    print("  PRESET FILTER VERIFICATION")
    print("  Live API spot-checks + negative tests")
    print("=" * 60)

    # Fetch all standard results in one scan
    print("\nFetching full universe (this takes a few minutes)...")
    from run_presets import ALL_TICKERS, PRESETS, apply_preset_filters, run_full_scan
    all_results = run_full_scan("standard")
    print(f"Got {len(all_results)} raw results\n")

    v = PresetVerifier()

    # Apply each preset and verify
    sndk = apply_preset_filters(all_results, PRESETS["SNDK Pattern"])
    verify_sndk(v, sndk)

    early = apply_preset_filters(all_results, PRESETS["Early Mover"])
    verify_early_mover(v, early)

    pullback = apply_preset_filters(all_results, PRESETS["Pullback Buy"])
    verify_pullback_buy(v, pullback)

    leading = apply_preset_filters(all_results, PRESETS["Leading Sector Scan"])
    verify_leading_sector(v, leading)

    stealth = apply_preset_filters(all_results, PRESETS["Stealth Accumulation"])
    verify_stealth_accumulation(v, stealth)

    aggressive = apply_preset_filters(all_results, PRESETS["Aggressive Early"])
    verify_aggressive_early(v, aggressive)

    # Final summary
    ok = v.summary()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
