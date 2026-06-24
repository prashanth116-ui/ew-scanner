"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { COLLAPSED_KEY } from "./constants";

// ── Sector Nav ──

const NAV_LINKS = [
  { key: "dashboard", href: "/sectors", label: "Dashboard" },
  { key: "picks", href: "/sectors/picks", label: "Picks" },
  { key: "brief", href: "/sectors/brief", label: "Brief" },
  { key: "guide", href: "/sectors/guide", label: "Guide" },
] as const;

export function SectorNav({ active }: { active: "dashboard" | "picks" | "brief" | "guide" }) {
  return (
    <nav className="flex items-center gap-1">
      {NAV_LINKS.map((link) => (
        <Link
          key={link.key}
          href={link.href}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
            active === link.key
              ? "bg-[#5ba3e6]/20 text-[#5ba3e6] border-[#5ba3e6]/30"
              : "text-[#666] hover:text-[#a0a0a0] border-transparent hover:border-[#333]"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

// ── Shared Sparkline ──

export function Sparkline({ returns, width = 60, height = 20 }: { returns?: number[]; width?: number; height?: number }) {
  if (!returns || returns.length < 3) return null;
  const min = Math.min(...returns);
  const max = Math.max(...returns);
  const range = max - min || 1;
  const points = returns
    .map((v, i) => `${(i / (returns.length - 1)) * width},${height - ((v - min) / range) * height}`)
    .join(" ");
  const lastVal = returns[returns.length - 1];
  const color = lastVal >= 0 ? "#4ade80" : "#f87171";
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

// ── Collapsible Panel ──

export function useCollapsedPanels(storageKey = COLLAPSED_KEY, defaultCollapsed?: string[]): [Set<string>, (id: string) => void] {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set<string>(defaultCollapsed);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return new Set(JSON.parse(raw) as string[]);
      // First visit — use defaults if provided
      return new Set<string>(defaultCollapsed);
    } catch { return new Set<string>(defaultCollapsed); }
  });

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);

  return [collapsed, toggle];
}

export function CollapsiblePanel({
  id,
  title,
  collapsed,
  onToggle,
  badge,
  actions,
  children,
  className = "",
}: {
  id: string;
  title: string;
  collapsed: boolean;
  onToggle: (id: string) => void;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-[#2a2a2a] bg-[#141414] ${className}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onToggle(id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(id); } }}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between px-4 py-3 text-left cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          {collapsed ? <ChevronDown className="h-4 w-4 text-[#666]" /> : <ChevronUp className="h-4 w-4 text-[#666]" />}
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {badge}
        </div>
        {actions && <div onClick={(e) => e.stopPropagation()}>{actions}</div>}
      </div>
      {!collapsed && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ── ETF Return Sparkline ──

export function EtfSparkline({ returns }: { returns: number[] | undefined }) {
  if (!returns || returns.length < 3) return null;
  const W = 48;
  const H = 18;
  const pad = 1;
  const min = Math.min(...returns);
  const max = Math.max(...returns);
  const range = max - min || 1;
  const points = returns.map((r, i) => {
    const x = pad + (i / (returns.length - 1)) * (W - 2 * pad);
    const y = H - pad - ((r - min) / range) * (H - 2 * pad);
    return `${x},${y}`;
  }).join(" ");
  const cumReturn = returns.reduce((s, r) => s + r, 0);
  const color = cumReturn >= 0 ? "#4ade80" : "#f87171";
  return (
    <svg width={W} height={H} className="inline-block" aria-label="20d return sparkline">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

// ── Data Staleness Warning ──

export function DataStalenessWarning({ calculatedAt }: { calculatedAt: string }) {
  const ageMinutes = Math.round((Date.now() - new Date(calculatedAt).getTime()) / 60000);
  if (ageMinutes <= 20) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-400">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>Data is {ageMinutes}min old. Refresh for latest signals.</span>
    </div>
  );
}
