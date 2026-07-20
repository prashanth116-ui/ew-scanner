"use client";

import { useId } from "react";

export function InfoTip({ text }: { text: string }) {
  const id = useId();
  return (
    <span
      className="group relative inline-flex cursor-help"
      aria-describedby={id}
      tabIndex={0}
    >
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#444] text-[9px] font-bold text-[#666] group-hover:border-[#888] group-hover:text-[#aaa] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#5ba3e6]">
        ?
      </span>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#333] bg-[#1a1a1a] px-2.5 py-1.5 text-[10px] text-[#ccc] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-w-[260px] whitespace-normal text-center leading-snug"
      >
        {text}
      </span>
    </span>
  );
}
