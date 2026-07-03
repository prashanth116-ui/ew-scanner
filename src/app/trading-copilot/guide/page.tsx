import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trading Copilot Guide | QuantRadar",
  description: "Learn how to use the ICT Trading Copilot for disciplined trade decision-making.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      {children}
    </section>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#5ba3e6]/30 bg-[#5ba3e6]/5 px-4 py-3 text-sm text-[#a0a0a0]">
      <span className="font-semibold text-[#5ba3e6]">Tip: </span>
      {children}
    </div>
  );
}

export default function CopilotGuidePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-bold text-white">Trading Copilot Guide</h1>
      <p className="mb-8 text-sm text-[#888]">
        A rule-based ICT decision support tool for disciplined trading.
      </p>

      <div className="space-y-8">
        <Section title="What Is the Trading Copilot?">
          <p className="text-sm leading-relaxed text-[#a0a0a0]">
            The Trading Copilot is a client-side dashboard that classifies your current market state,
            scores your setup quality, and outputs a clear decision: <strong className="text-green-400">TRADE</strong>,{" "}
            <strong className="text-yellow-400">WATCH</strong>, <strong className="text-neutral-400">WAIT</strong>, or{" "}
            <strong className="text-red-400">BLOCKED</strong>. It does not fetch live data or execute trades.
            You manually enter market conditions and the rule engine computes results in real-time.
          </p>
        </Section>

        <Section title="How Scoring Works">
          <p className="text-sm leading-relaxed text-[#a0a0a0]">
            The scoring system uses an additive/subtractive model clamped to 0-10:
          </p>
          <div className="mt-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-[#888]">
                  <th className="px-4 py-2 text-left font-medium">Factor</th>
                  <th className="px-4 py-2 text-right font-medium">Points</th>
                </tr>
              </thead>
              <tbody className="text-[#a0a0a0]">
                <tr className="border-b border-[#2a2a2a]/50"><td className="px-4 py-1.5">HTF Alignment (4 TFs)</td><td className="px-4 py-1.5 text-right text-green-400">+2</td></tr>
                <tr className="border-b border-[#2a2a2a]/50"><td className="px-4 py-1.5">15M Confirmation</td><td className="px-4 py-1.5 text-right text-green-400">+2</td></tr>
                <tr className="border-b border-[#2a2a2a]/50"><td className="px-4 py-1.5">Liquidity Sweep</td><td className="px-4 py-1.5 text-right text-green-400">+2</td></tr>
                <tr className="border-b border-[#2a2a2a]/50"><td className="px-4 py-1.5">Market Structure Shift</td><td className="px-4 py-1.5 text-right text-green-400">+2</td></tr>
                <tr className="border-b border-[#2a2a2a]/50"><td className="px-4 py-1.5">Displacement</td><td className="px-4 py-1.5 text-right text-green-400">+1</td></tr>
                <tr className="border-b border-[#2a2a2a]/50"><td className="px-4 py-1.5">FVG Present</td><td className="px-4 py-1.5 text-right text-green-400">+1</td></tr>
                <tr className="border-b border-[#2a2a2a]"><td className="px-4 py-1.5">FVG Retest</td><td className="px-4 py-1.5 text-right text-green-400">+1</td></tr>
                <tr className="border-b border-[#2a2a2a]/50"><td className="px-4 py-1.5">Mid-Range Zone</td><td className="px-4 py-1.5 text-right text-red-400">-3</td></tr>
                <tr className="border-b border-[#2a2a2a]/50"><td className="px-4 py-1.5">Opposing PDA</td><td className="px-4 py-1.5 text-right text-red-400">-3</td></tr>
                <tr className="border-b border-[#2a2a2a]/50"><td className="px-4 py-1.5">No 15M Bias</td><td className="px-4 py-1.5 text-right text-red-400">-2</td></tr>
                <tr className="border-b border-[#2a2a2a]/50"><td className="px-4 py-1.5">Poor R:R (&lt; 2:1)</td><td className="px-4 py-1.5 text-right text-red-400">-2</td></tr>
                <tr className="border-b border-[#2a2a2a]/50"><td className="px-4 py-1.5">Price Far From PDA</td><td className="px-4 py-1.5 text-right text-red-400">-2</td></tr>
                <tr><td className="px-4 py-1.5">Revenge Guard</td><td className="px-4 py-1.5 text-right text-red-400">-3 to -5</td></tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Score Tiers">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {([
              { tier: "A+", range: "9-10", color: "text-green-400" },
              { tier: "A", range: "7-8", color: "text-green-400" },
              { tier: "B", range: "5-6", color: "text-yellow-400" },
              { tier: "C", range: "3-4", color: "text-orange-400" },
              { tier: "D", range: "1-2", color: "text-red-400" },
              { tier: "F", range: "0", color: "text-red-400" },
            ] as const).map((t) => (
              <div key={t.tier} className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3 text-center">
                <div className={`text-lg font-bold ${t.color}`}>{t.tier}</div>
                <div className="text-[10px] text-[#666]">{t.range}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Decisions Explained">
          <div className="space-y-2">
            {([
              { decision: "TRADE", color: "border-green-600/30 bg-green-900/10", text: "text-green-400", desc: "Score >= 7 and trade mode is active. Execute with discipline." },
              { decision: "WATCH", color: "border-yellow-600/30 bg-yellow-900/10", text: "text-yellow-400", desc: "Score 4-6. Conditions are developing. Wait for confirmation before entry." },
              { decision: "WAIT", color: "border-neutral-600/30 bg-neutral-800/10", text: "text-neutral-400", desc: "Score < 4 or session is in a chop zone. No setup — be patient." },
              { decision: "BLOCKED", color: "border-red-600/30 bg-red-900/10", text: "text-red-400", desc: "Loss limit hit, revenge guard active, or manual block enabled. Step away." },
            ] as const).map((d) => (
              <div key={d.decision} className={`rounded-lg border ${d.color} px-4 py-2.5`}>
                <span className={`text-sm font-bold ${d.text}`}>{d.decision}</span>
                <span className="ml-3 text-xs text-[#a0a0a0]">{d.desc}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Revenge Guard">
          <p className="text-sm leading-relaxed text-[#a0a0a0]">
            The revenge guard monitors your loss count and timing to prevent emotional trading:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-[#a0a0a0]">
            <li><strong className="text-green-400">Clear:</strong> No revenge risk detected.</li>
            <li><strong className="text-yellow-400">Warning:</strong> Recent loss within 15 minutes. Slow down.</li>
            <li><strong className="text-orange-400">Lockout:</strong> 2 consecutive losses. Step away and reset.</li>
            <li><strong className="text-red-400">Blocked:</strong> 3+ losses today or 3+ consecutive. Done for the day.</li>
          </ul>
        </Section>

        <Section title="Using Mock Presets">
          <p className="text-sm leading-relaxed text-[#a0a0a0]">
            Click any preset button in the sidebar to load sample data and see how the scoring engine evaluates
            different scenarios. Three presets are included:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-[#a0a0a0]">
            <li><strong className="text-white">ES Bull Setup:</strong> High-conviction bullish alignment (score ~9, TRADE)</li>
            <li><strong className="text-white">NQ Caution:</strong> Mixed signals with one loss (score ~5, WATCH)</li>
            <li><strong className="text-white">AAPL Blocked:</strong> Range-bound with revenge guard triggered (score ~2, BLOCKED)</li>
          </ul>
          <Tip>
            Start with a preset, then toggle individual conditions to see how each factor affects the score.
          </Tip>
        </Section>

        <Section title="Disclaimer">
          <p className="text-sm leading-relaxed text-[#a0a0a0]">
            This tool is for <strong className="text-white">educational and journaling purposes only</strong>.
            It does not provide financial advice, execute trades, or guarantee outcomes.
            All scoring is mechanical — based on the conditions you enter.
            Use it to build discipline and avoid emotional decisions.
          </p>
        </Section>
      </div>
    </div>
  );
}
