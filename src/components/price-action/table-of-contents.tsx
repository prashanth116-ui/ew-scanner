"use client";

import { useState, useEffect } from "react";
import { List, X, ChevronDown } from "lucide-react";

export interface TocItem {
  id: string;
  number: number;
  title: string;
  difficulty: "beginner" | "intermediate" | "advanced" | "institutional";
}

const difficultyDot = {
  beginner: "bg-emerald-400",
  intermediate: "bg-sky-400",
  advanced: "bg-amber-400",
  institutional: "bg-purple-400",
};

interface DesktopTocProps {
  items: TocItem[];
  activeId: string;
  onNavigate: (id: string) => void;
}

function DesktopToc({ items, activeId, onNavigate }: DesktopTocProps) {
  return (
    <nav
      className="sticky top-24 hidden max-h-[calc(100vh-8rem)] w-56 shrink-0 overflow-y-auto xl:block"
      aria-label="Table of contents"
    >
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#666]">
        Contents
      </div>
      <div className="space-y-0.5">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
              activeId === item.id
                ? "bg-[#1a1a1a] text-white"
                : "text-[#666] hover:text-[#a0a0a0]"
            }`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${difficultyDot[item.difficulty]}`} />
            <span className="shrink-0 font-mono text-[10px] text-[#555]">{item.number}.</span>
            <span className="truncate">{item.title}</span>
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 space-y-1 border-t border-[#2a2a2a] pt-3">
        <div className="text-[10px] uppercase tracking-wider text-[#555]">Difficulty</div>
        {(["beginner", "intermediate", "advanced", "institutional"] as const).map((d) => (
          <div key={d} className="flex items-center gap-1.5 text-[10px] text-[#666]">
            <span className={`h-1.5 w-1.5 rounded-full ${difficultyDot[d]}`} />
            <span className="capitalize">{d}</span>
          </div>
        ))}
      </div>
    </nav>
  );
}

interface MobileTocProps {
  items: TocItem[];
  activeId: string;
  onNavigate: (id: string) => void;
}

function MobileToc({ items, activeId, onNavigate }: MobileTocProps) {
  const [open, setOpen] = useState(false);

  const handleNav = (id: string) => {
    setOpen(false);
    onNavigate(id);
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 xl:hidden">
      {open && (
        <div className="mb-2 max-h-[60vh] w-72 overflow-y-auto rounded-lg border border-[#2a2a2a] bg-[#0f0f0f]/98 p-3 shadow-xl backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-[#a0a0a0]">Contents</span>
            <button onClick={() => setOpen(false)} className="text-[#666] hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-0.5">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors ${
                  activeId === item.id
                    ? "bg-[#1a1a1a] text-white"
                    : "text-[#666] hover:text-[#a0a0a0]"
                }`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${difficultyDot[item.difficulty]}`} />
                <span className="truncate">{item.number}. {item.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-[#185FA5] text-white shadow-lg transition-transform hover:scale-105"
        aria-label="Toggle table of contents"
      >
        {open ? <ChevronDown className="h-5 w-5" /> : <List className="h-5 w-5" />}
      </button>
    </div>
  );
}

interface TableOfContentsProps {
  items: TocItem[];
}

export function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [items]);

  const handleNavigate = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <DesktopToc items={items} activeId={activeId} onNavigate={handleNavigate} />
      <MobileToc items={items} activeId={activeId} onNavigate={handleNavigate} />
    </>
  );
}
