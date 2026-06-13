"use client";

const ACCENT = "#8b5cf6";

export default function WaveScannerGuidePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">Wave Scanner Guide</h1>
      <p className="text-sm text-[#a0a0a0] mb-8">
        How the Phase 2 Elliott Wave detector finds impulse patterns, tracks ABC corrections,
        computes Fibonacci retracement targets, and scores confidence.
      </p>

      <div className="space-y-8">
        {/* Overview */}
        <Section title="Overview">
          <p>
            The Wave Scanner detects <strong>5-wave impulse patterns</strong> across multiple scales
            using a zigzag-based algorithm. It then tracks <strong>ABC corrections</strong> after
            completed impulses and computes <strong>Fibonacci retracement levels</strong> for trade entries.
          </p>
          <p className="mt-2">
            The detector is timeframe-agnostic — it works on both weekly and daily bars. Weekly scans
            use scales 3, 5, 8 while daily scans use scales 4, 8, 16.
          </p>
        </Section>

        {/* Pipeline */}
        <Section title="Detection Pipeline">
          <ol className="list-decimal list-inside space-y-2">
            <li><strong>Swing Detection</strong> — Find swing highs and lows using asymmetric lookback (left=scale, right=1).</li>
            <li><strong>Zigzag Construction</strong> — Merge swings chronologically, enforce strict alternation (high-low-high-low). At the same bar index, highs sort before lows.</li>
            <li><strong>Impulse Rule Check</strong> — Walk 6-point windows through the zigzag and check the 4 cardinal Elliott Wave rules.</li>
            <li><strong>Enrichment</strong> — Score each valid impulse for confidence (40-95%) based on wave extension, alternation, RSI divergence, and volume.</li>
            <li><strong>Invalidation</strong> — Check if price action after detection violates Rule 3 (W4 entering W1 territory).</li>
            <li><strong>ABC Correction Tracking</strong> — State machine finds A, B, C pivots after W5, classifies as zigzag or flat.</li>
            <li><strong>Fibonacci Targets</strong> — Compute 5 retracement levels (23.6% through 78.6%) from the impulse range.</li>
          </ol>
        </Section>

        {/* Impulse Rules */}
        <Section title="The 4 Cardinal Impulse Rules">
          <div className="grid gap-3 sm:grid-cols-2">
            <RuleCard number={1} title="Wave 2 Floor" description="Wave 2 must not retrace beyond Wave 0 (the starting point). In a bull impulse, W2 must stay above W0." />
            <RuleCard number={2} title="Wave 3 Not Shortest" description="Wave 3 must not be the shortest of Waves 1, 3, and 5. W3 is often the longest (extended) wave." />
            <RuleCard number={3} title="Wave 4 Territory" description="Wave 4 must not enter Wave 1's price territory. In a bull impulse, W4 must stay above W1." />
            <RuleCard number={5} title="Wave 5 New Extreme" description="Wave 5 must make a new price extreme beyond Wave 3. In a bull impulse, W5 must exceed W3's high." />
          </div>
        </Section>

        {/* Confidence Scoring */}
        <Section title="Confidence Scoring (40-95%)">
          <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a]">
                  <th className="px-4 py-2 text-left text-xs text-[#666]">Factor</th>
                  <th className="px-4 py-2 text-right text-xs text-[#666]">Points</th>
                  <th className="px-4 py-2 text-left text-xs text-[#666]">Criteria</th>
                </tr>
              </thead>
              <tbody className="text-[#ccc]">
                <tr className="border-b border-[#1a1a1a]">
                  <td className="px-4 py-2">Base</td>
                  <td className="px-4 py-2 text-right text-white font-medium">40</td>
                  <td className="px-4 py-2 text-[#888]">All valid impulses start here</td>
                </tr>
                <tr className="border-b border-[#1a1a1a]">
                  <td className="px-4 py-2">Extended W3</td>
                  <td className="px-4 py-2 text-right text-green-400 font-medium">+15</td>
                  <td className="px-4 py-2 text-[#888]">Wave 3 is the longest wave</td>
                </tr>
                <tr className="border-b border-[#1a1a1a]">
                  <td className="px-4 py-2">Alternation</td>
                  <td className="px-4 py-2 text-right text-green-400 font-medium">+10</td>
                  <td className="px-4 py-2 text-[#888]">W2 and W4 retrace ratios differ by &gt;10%</td>
                </tr>
                <tr className="border-b border-[#1a1a1a]">
                  <td className="px-4 py-2">RSI Divergence</td>
                  <td className="px-4 py-2 text-right text-green-400 font-medium">+10</td>
                  <td className="px-4 py-2 text-[#888]">W5 makes new price extreme but RSI does not</td>
                </tr>
                <tr className="border-b border-[#1a1a1a]">
                  <td className="px-4 py-2">Volume Confirm</td>
                  <td className="px-4 py-2 text-right text-green-400 font-medium">+10</td>
                  <td className="px-4 py-2 text-[#888]">Volume at W3 exceeds 20-period SMA</td>
                </tr>
                <tr className="border-b border-[#1a1a1a]">
                  <td className="px-4 py-2">W2 Retrace</td>
                  <td className="px-4 py-2 text-right text-amber-400 font-medium">+5</td>
                  <td className="px-4 py-2 text-[#888]">W2 retraces 38-62% of W1</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">W4 Retrace</td>
                  <td className="px-4 py-2 text-right text-amber-400 font-medium">+5</td>
                  <td className="px-4 py-2 text-[#888]">W4 retraces 23-50% of W3</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#888]">
            Completed ABC corrections add +15 to the parent impulse confidence (capped at 100%).
          </p>
        </Section>

        {/* ABC Corrections */}
        <Section title="ABC Correction Tracking">
          <p>
            After a completed impulse (W5 found), the detector searches for a 3-wave corrective pattern:
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
              <h4 className="text-sm font-medium text-cyan-400 mb-2">Zigzag Correction</h4>
              <p className="text-xs text-[#888]">
                Wave B retraces &lt;90% of Wave A. Sharp, impulsive moves. Common after extended W3 impulses.
                Typically retraces 38.2-61.8% of the impulse.
              </p>
            </div>
            <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
              <h4 className="text-sm font-medium text-cyan-400 mb-2">Flat Correction</h4>
              <p className="text-xs text-[#888]">
                Wave B retraces &gt;90% of Wave A. Sideways consolidation pattern. Price moves in a range,
                building energy for the next impulse. Often seen in strong trends.
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-[#888]">
            Validation rule: Wave C must not retrace more than 85.4% of the total impulse range (|W5-W0|).
            Corrections exceeding this threshold are rejected as potential trend reversals.
          </p>
        </Section>

        {/* Fibonacci Targets */}
        <Section title="Fibonacci Retracement Targets">
          <p>
            After each impulse, 5 Fibonacci retracement levels are computed from the impulse range (|W5 - W0|):
          </p>
          <div className="mt-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a]">
                  <th className="px-4 py-2 text-left text-xs text-[#666]">Level</th>
                  <th className="px-4 py-2 text-left text-xs text-[#666]">Usage</th>
                </tr>
              </thead>
              <tbody className="text-[#ccc]">
                <tr className="border-b border-[#1a1a1a]">
                  <td className="px-4 py-2 text-[#a78bfa] font-medium">23.6%</td>
                  <td className="px-4 py-2 text-[#888]">Shallow retracement — strong trend continuation</td>
                </tr>
                <tr className="border-b border-[#1a1a1a]">
                  <td className="px-4 py-2 text-[#a78bfa] font-medium">38.2%</td>
                  <td className="px-4 py-2 text-[#888]">Key support/resistance — common entry zone start</td>
                </tr>
                <tr className="border-b border-[#1a1a1a]">
                  <td className="px-4 py-2 text-[#a78bfa] font-medium">50.0%</td>
                  <td className="px-4 py-2 text-[#888]">Mid-point retracement — balanced entry</td>
                </tr>
                <tr className="border-b border-[#1a1a1a]">
                  <td className="px-4 py-2 text-[#a78bfa] font-medium">61.8%</td>
                  <td className="px-4 py-2 text-[#888]">Golden ratio — prime entry zone end</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-[#a78bfa] font-medium">78.6%</td>
                  <td className="px-4 py-2 text-[#888]">Deep retracement — last chance entry before invalidation</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#888]">
            The <strong>Correction Entry</strong> scanner mode specifically looks for patterns where
            price is currently between the 38.2% and 61.8% retracement levels — the optimal entry zone.
          </p>
        </Section>

        {/* Scanner Modes */}
        <Section title="Scanner Modes">
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard
              title="Active Impulse"
              color="text-amber-400"
              description="Valid impulse patterns in progress. Wave structure detected and not yet invalidated. No ABC correction started."
            />
            <ModeCard
              title="Correction Entry"
              color="text-green-400"
              description="Price is between 38.2% and 61.8% Fibonacci levels of a completed impulse. Optimal entry zone for the next wave."
            />
            <ModeCard
              title="Post-Correction"
              color="text-cyan-400"
              description="ABC correction completed. Potential start of a new impulse wave. Filter by zigzag or flat correction type."
            />
            <ModeCard
              title="High Confidence"
              color="text-[#a78bfa]"
              description="Patterns scoring 70%+ confidence. Extended W3, RSI divergence, volume confirmation, and ideal retracement ratios."
            />
          </div>
        </Section>

        {/* Scales */}
        <Section title="Scale Selection">
          <p>
            The scale parameter controls the lookback window for swing detection. Larger scales find
            larger wave structures (longer-term patterns), while smaller scales detect shorter-term waves.
          </p>
          <div className="mt-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2a2a]">
                  <th className="px-4 py-2 text-left text-xs text-[#666]">Timeframe</th>
                  <th className="px-4 py-2 text-left text-xs text-[#666]">Scales</th>
                  <th className="px-4 py-2 text-left text-xs text-[#666]">Pattern Duration</th>
                </tr>
              </thead>
              <tbody className="text-[#ccc]">
                <tr className="border-b border-[#1a1a1a]">
                  <td className="px-4 py-2">Weekly</td>
                  <td className="px-4 py-2 text-[#a78bfa]">3, 5, 8</td>
                  <td className="px-4 py-2 text-[#888]">Months to years</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">Daily</td>
                  <td className="px-4 py-2 text-[#a78bfa]">4, 8, 16</td>
                  <td className="px-4 py-2 text-[#888]">Weeks to months</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#888]">
            Multiple scales can be selected simultaneously. Each scale generates independent zigzag
            structures, so a ticker may show patterns at different scales with different confidence levels.
          </p>
        </Section>

        {/* Futures Support */}
        <Section title="Futures Support">
          <p>
            The Wave Scanner supports futures symbols via Yahoo Finance (e.g., ES=F, NQ=F, GC=F).
            The Futures universe includes equity index futures, metals, energy, bonds, currencies, and crypto.
          </p>
          <p className="mt-2 text-xs text-[#888]">
            Futures use the same detection algorithm as equities. The only difference is ticker format
            (symbol=F instead of plain symbol) and available data range (varies by contract).
          </p>
        </Section>
      </div>
    </div>
  );
}

// ── Reusable components ──

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-white mb-3 pb-2 border-b border-[#2a2a2a]">{title}</h2>
      <div className="text-sm text-[#ccc] leading-relaxed">{children}</div>
    </section>
  );
}

function RuleCard({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: ACCENT }}
        >
          {number}
        </span>
        <h4 className="text-sm font-medium text-white">{title}</h4>
      </div>
      <p className="text-xs text-[#888] leading-relaxed">{description}</p>
    </div>
  );
}

function ModeCard({ title, color, description }: { title: string; color: string; description: string }) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
      <h4 className={`text-sm font-medium ${color} mb-2`}>{title}</h4>
      <p className="text-xs text-[#888] leading-relaxed">{description}</p>
    </div>
  );
}
