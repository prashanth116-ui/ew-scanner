"use client";

import { Shield, ShieldAlert, ShieldOff } from "lucide-react";
import type { RevengeGuardResult } from "@/lib/tradingCopilot/types";

const STATUS_CONFIG = {
  clear:   { icon: Shield,      color: "text-green-400",   bg: "bg-green-900/20", label: "Clear" },
  warning: { icon: ShieldAlert, color: "text-yellow-400",  bg: "bg-yellow-900/20", label: "Warning" },
  lockout: { icon: ShieldOff,   color: "text-orange-400",  bg: "bg-orange-900/20", label: "Lockout" },
  blocked: { icon: ShieldOff,   color: "text-red-400",     bg: "bg-red-900/20",    label: "Blocked" },
} as const;

interface RevengeGuardCardProps {
  result: RevengeGuardResult;
}

export function RevengeGuardCard({ result }: RevengeGuardCardProps) {
  const c = STATUS_CONFIG[result.status];
  const Icon = c.icon;

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]">
        Revenge Guard
      </h3>

      <div className={`flex items-start gap-3 rounded-md ${c.bg} px-3 py-2.5`}>
        <Icon className={`h-5 w-5 shrink-0 ${c.color}`} />
        <div>
          <div className={`text-sm font-semibold ${c.color}`}>{c.label}</div>
          <p className="mt-0.5 text-xs text-[#a0a0a0]">{result.message}</p>
        </div>
      </div>

      <div className="mt-3 flex gap-4 text-xs text-[#888]">
        <span>Losses today: <span className="text-white">{result.lossCount}</span></span>
        <span>Consecutive: <span className="text-white">{result.consecutiveLosses}</span></span>
      </div>
    </div>
  );
}
