"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface LayerSectionProps {
  id: string;
  number: number;
  title: string;
  difficulty: "beginner" | "intermediate" | "advanced" | "institutional";
  children: React.ReactNode;
}

const difficultyConfig = {
  beginner: { label: "Beginner", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  intermediate: { label: "Intermediate", color: "bg-sky-500/20 text-sky-400 border-sky-500/30" },
  advanced: { label: "Advanced", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  institutional: { label: "Institutional", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
};

export function LayerSection({ id, number, title, difficulty, children }: LayerSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const cfg = difficultyConfig[difficulty];

  return (
    <section id={id} className="scroll-mt-24">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="group mb-4 flex w-full items-center gap-4 text-left"
        aria-expanded={!collapsed}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1a1a1a] text-sm font-bold text-[#5ba3e6] ring-1 ring-[#2a2a2a]">
          {number}
        </span>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-white group-hover:text-[#5ba3e6] transition-colors sm:text-2xl">
            {title}
          </h2>
        </div>
        <span className={`hidden shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium sm:inline ${cfg.color}`}>
          {cfg.label}
        </span>
        {collapsed ? (
          <ChevronDown className="h-5 w-5 shrink-0 text-[#666]" />
        ) : (
          <ChevronUp className="h-5 w-5 shrink-0 text-[#666]" />
        )}
      </button>

      {!collapsed && (
        <div className="ml-0 space-y-5 pb-10 sm:ml-14">
          {children}
        </div>
      )}

      <div className="my-8 h-px bg-[#2a2a2a]" />
    </section>
  );
}
