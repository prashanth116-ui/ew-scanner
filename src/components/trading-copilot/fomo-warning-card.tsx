"use client";

import { AlertTriangle, CheckCircle } from "lucide-react";
import type { FomoCondition } from "@/lib/tradingCopilot/types";

interface FomoWarningCardProps {
  conditions: FomoCondition[];
}

export function FomoWarningCard({ conditions }: FomoWarningCardProps) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]">
        FOMO Guard
      </h3>

      {conditions.length === 0 ? (
        <div className="flex items-center gap-2 text-green-400">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm">All clear — no FOMO signals</span>
        </div>
      ) : (
        <div className="space-y-2">
          {conditions.map((c) => (
            <div
              key={c.id}
              className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ${
                c.severity === "danger"
                  ? "bg-red-900/20 text-red-400"
                  : "bg-yellow-900/20 text-yellow-400"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
