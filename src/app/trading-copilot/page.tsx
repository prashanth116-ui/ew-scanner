"use client";

import { Suspense, useMemo } from "react";
import { SidebarShell } from "@/components/sidebar-shell";
import { useSidebarState } from "@/lib/hooks/use-sidebar-state";
import { useCollapsibleSections } from "@/lib/hooks/use-collapsible-sections";
import { usePersistedFilter } from "@/lib/hooks/use-filter-persistence";
import type { CopilotInput } from "@/lib/tradingCopilot/types";
import { DEFAULT_COPILOT_INPUT } from "@/lib/tradingCopilot/types";
import { evaluateCopilot } from "@/lib/tradingCopilot/ruleEngine";

import { CopilotInputForm } from "@/components/trading-copilot/copilot-input-form";
import { DecisionBanner } from "@/components/trading-copilot/decision-banner";
import { MarketStateCard } from "@/components/trading-copilot/market-state-card";
import { TradeModeCard } from "@/components/trading-copilot/trade-mode-card";
import { SetupScoreCard } from "@/components/trading-copilot/setup-score-card";
import { FomoWarningCard } from "@/components/trading-copilot/fomo-warning-card";
import { RevengeGuardCard } from "@/components/trading-copilot/revenge-guard-card";
import { HtfBiasCard } from "@/components/trading-copilot/htf-bias-card";
import { PdaLocationCard } from "@/components/trading-copilot/pda-location-card";
import { NarrativeCard } from "@/components/trading-copilot/narrative-card";
import { CopilotDisclaimer } from "@/components/trading-copilot/copilot-disclaimer";

function CopilotDashboard() {
  const [sidebarOpen, setSidebarOpen] = useSidebarState("copilot", true);
  const { collapsed, toggleSection } = useCollapsibleSections(["state"], "copilot");
  const [input, setInput] = usePersistedFilter<CopilotInput>("copilot:input", DEFAULT_COPILOT_INPUT);

  const result = useMemo(() => evaluateCopilot(input), [input]);

  return (
    <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
      {/* Sidebar */}
      <SidebarShell open={sidebarOpen} onToggle={setSidebarOpen}>
        <CopilotInputForm
          input={input}
          onChange={setInput}
          collapsed={collapsed}
          toggleSection={toggleSection}
        />
      </SidebarShell>

      {/* Main content */}
      <main className="flex-1 min-w-0 space-y-4">
        {/* Decision Banner */}
        <DecisionBanner
          decision={result.decision}
          score={result.score}
          scoreTier={result.scoreTier}
        />

        {/* Session warning */}
        {result.sessionWarning && (
          <div className="rounded-lg border border-yellow-600/30 bg-yellow-900/20 px-4 py-2.5 text-xs text-yellow-400">
            {result.sessionWarning}
          </div>
        )}

        {/* Time window badge */}
        <div className="flex items-center gap-2 text-xs text-[#888]">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: getTimeWindowColor(result.timeWindow.quality) }} />
          <span>{result.timeWindow.label}</span>
          <span className="text-[#555]">({result.timeWindow.start} - {result.timeWindow.end} ET)</span>
        </div>

        {/* Top row: State + Mode */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MarketStateCard state={result.marketState} />
          <TradeModeCard mode={result.tradeMode} />
        </div>

        {/* Score + HTF */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SetupScoreCard
            score={result.score}
            tier={result.scoreTier}
            breakdown={result.scoreBreakdown}
          />
          <HtfBiasCard result={result.htfAlignment} />
        </div>

        {/* PDA + Revenge + FOMO */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <PdaLocationCard
            result={result.pdaLocation}
            currentPrice={input.currentPrice}
            pdaHigh={input.pdaHighLevel}
            pdaLow={input.pdaLowLevel}
            obLevel={input.nearestOBLevel}
            fvgLevel={input.nearestFVGLevel}
          />
          <RevengeGuardCard result={result.revengeGuard} />
          <FomoWarningCard conditions={result.fomoConditions} />
        </div>

        {/* Narrative */}
        <NarrativeCard narrative={result.narrative} />

        {/* Disclaimer */}
        <CopilotDisclaimer />
      </main>
    </div>
  );
}

function getTimeWindowColor(quality: string): string {
  switch (quality) {
    case "high": return "#22c55e";
    case "medium": return "#eab308";
    case "low": return "#f97316";
    case "avoid": return "#ef4444";
    default: return "#666";
  }
}

export default function TradingCopilotPage() {
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-7xl px-6 py-12 text-center text-[#666]">
        Loading copilot...
      </div>
    }>
      <CopilotDashboard />
    </Suspense>
  );
}
