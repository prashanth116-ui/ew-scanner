"use client";

import Link from "next/link";
import { TrendingUp, Shield, Banknote, Crosshair, AlertTriangle, ChevronRight } from "lucide-react";
import type { MarketPosture, PostureResult, RiskFlag, SectorTiers } from "@/lib/sector-rotation/brief";
import { InfoTip } from "./info-tip";

const POSTURE_STYLES: Record<MarketPosture, { bg: string; border: string; text: string; icon: typeof TrendingUp }> = {
  AGGRESSIVE: { bg: "bg-green-500/10", border: "border-green-500/40", text: "text-green-400", icon: TrendingUp },
  SELECTIVE: { bg: "bg-cyan-500/10", border: "border-cyan-500/40", text: "text-cyan-400", icon: Crosshair },
  DEFENSIVE: { bg: "bg-amber-500/10", border: "border-amber-500/40", text: "text-amber-400", icon: Shield },
  CASH: { bg: "bg-red-500/10", border: "border-red-500/40", text: "text-red-400", icon: Banknote },
};

export function ActionSummary({
  posture,
  riskFlags,
  tiers,
  page = "dashboard",
}: {
  posture: PostureResult;
  riskFlags: RiskFlag[];
  tiers: SectorTiers;
  page?: "dashboard" | "picks";
}) {
  const style = POSTURE_STYLES[posture.posture];
  const Icon = style.icon;
  const highFlags = riskFlags.filter((f) => f.severity === "high");
  const topActionable = tiers.actionable.slice(0, 3).map((s) => s.sector);

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-4 space-y-3`}>
      {/* Posture + Reasoning */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Icon className={`h-6 w-6 shrink-0 ${style.text}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold ${style.text}`}>{posture.posture}</span>
              <InfoTip text="Market posture combines regime, VIX, rotation conviction, and sector dispersion into a single positioning recommendation" />
            </div>
            <p className="text-xs text-[#aaa] leading-snug mt-0.5">{posture.reasoning}</p>
          </div>
        </div>
      </div>

      {/* Risk Flags + Tiers row */}
      <div className="flex flex-wrap items-start gap-4 text-xs">
        {/* Risk Flags */}
        <div className="shrink-0">
          {riskFlags.length === 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-green-400 font-medium">
              No risk flags
            </span>
          ) : (
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-red-400 font-medium">
                <AlertTriangle className="h-3 w-3" />
                {riskFlags.length} risk flag{riskFlags.length > 1 ? "s" : ""}
                {highFlags.length > 0 && <span className="text-[9px] opacity-70">({highFlags.length} high)</span>}
              </span>
              {riskFlags.length <= 2 && (
                <div className="mt-1.5 space-y-0.5">
                  {riskFlags.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[10px] text-[#999]">
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${f.severity === "high" ? "bg-red-400" : "bg-amber-400"}`} />
                      {f.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="hidden sm:block h-8 w-px bg-[#2a2a2a] self-center" />

        {/* Sector Tiers */}
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-green-400 font-medium">{tiers.actionable.length} actionable</span>
            <span className="text-amber-400">{tiers.watch.length} watch</span>
            <span className="text-red-400">{tiers.avoid.length} avoid</span>
          </div>
          {topActionable.length > 0 && (
            <p className="mt-0.5 text-[10px] text-[#888] truncate">
              Top: {topActionable.join(", ")}
            </p>
          )}
        </div>
      </div>

      {/* Workflow Stepper */}
      <WorkflowStepper page={page} />

      {/* Brief link */}
      <Link
        href="/sectors/brief"
        className="inline-flex items-center gap-1 text-[11px] text-[#888] hover:text-white transition-colors"
      >
        Full analysis in Brief <ChevronRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function WorkflowStepper({ page }: { page: "dashboard" | "picks" }) {
  const steps = [
    { num: 1, label: "Assess", desc: "posture + risks", href: "#action-summary", active: page === "dashboard" },
    { num: 2, label: "Analyze", desc: "sectors + RRG", href: "#sector-scores", active: page === "dashboard" },
    { num: 3, label: "Act", desc: "picks + entries", href: "/sectors/picks", active: page === "picks" },
  ];

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {steps.map((step, i) => (
        <div key={step.num} className="flex items-center gap-1 shrink-0">
          {i > 0 && <div className="w-4 h-px bg-[#333]" />}
          <Link
            href={step.href}
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium border transition-colors ${
              step.active
                ? "border-[#5ba3e6]/30 bg-[#5ba3e6]/10 text-[#5ba3e6]"
                : "border-transparent text-[#666] hover:text-[#aaa]"
            }`}
          >
            <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
              step.active ? "bg-[#5ba3e6]/20 text-[#5ba3e6]" : "bg-[#222] text-[#555]"
            }`}>
              {step.num}
            </span>
            {step.label}
            <span className="text-[9px] opacity-60 hidden sm:inline">{step.desc}</span>
          </Link>
        </div>
      ))}
    </div>
  );
}
