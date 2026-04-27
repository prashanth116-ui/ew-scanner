"use client";

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Collapsible sidebar section with a toggle header.
 * Used by all scanner sidebars for sections like Presets, Filters, etc.
 */
interface SidebarSectionProps {
  title: string;
  sectionKey: string;
  collapsed: boolean;
  onToggle: (key: string) => void;
  children: ReactNode;
}

export function SidebarSection({ title, sectionKey, collapsed, onToggle, children }: SidebarSectionProps) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a]">
      <button
        onClick={() => onToggle(sectionKey)}
        className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]"
      >
        <span>{title}</span>
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed ? "" : "rotate-90"}`} />
      </button>
      {!collapsed && (
        <div className="border-t border-[#2a2a2a] px-4 pb-3 pt-2">
          {children}
        </div>
      )}
    </div>
  );
}
