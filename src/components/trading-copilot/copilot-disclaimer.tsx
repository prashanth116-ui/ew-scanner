"use client";

import { Info } from "lucide-react";

export function CopilotDisclaimer() {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] px-4 py-3 flex items-start gap-3">
      <Info className="h-4 w-4 text-[#5ba3e6] mt-0.5 shrink-0" />
      <p className="text-xs leading-relaxed text-[#666]">
        This copilot is a <strong className="text-[#888]">rule-based journaling and decision support tool</strong>.
        It does not provide financial advice, execute trades, or guarantee outcomes.
        All scoring is mechanical — based on the conditions you enter.
        Use it to stay disciplined and avoid emotional decisions.
      </p>
    </div>
  );
}
