"use client";

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex cursor-help">
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#444] text-[9px] font-bold text-[#666] group-hover:border-[#888] group-hover:text-[#aaa] transition-colors">
        ?
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#333] bg-[#1a1a1a] px-2.5 py-1.5 text-[10px] text-[#ccc] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 max-w-[260px] whitespace-normal text-center leading-snug">
        {text}
      </span>
    </span>
  );
}
