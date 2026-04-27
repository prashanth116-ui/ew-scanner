"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared sidebar shell used by scanner pages with a collapsible sidebar.
 * Renders the open/close toggle buttons and the aside wrapper.
 */
interface SidebarShellProps {
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}

export function SidebarShell({ open, onToggle, children }: SidebarShellProps) {
  return (
    <>
      {/* Toggle buttons (visible when sidebar collapsed) */}
      {!open && (
        <>
          <button
            onClick={() => onToggle(true)}
            className="hidden lg:flex items-center justify-center w-8 h-8 rounded-md border border-[#2a2a2a] bg-[#141414] text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors shrink-0 self-start sticky top-20"
            title="Show sidebar"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => onToggle(true)}
            className="lg:hidden flex items-center gap-1.5 rounded-md border border-[#2a2a2a] bg-[#141414] px-3 py-1.5 text-xs text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors self-start"
          >
            <PanelLeft className="h-3.5 w-3.5" />
            Filters
          </button>
        </>
      )}

      {/* Sidebar panel */}
      <aside className={`w-full lg:w-72 shrink-0 space-y-4 ${open ? "" : "hidden lg:hidden"}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[#a0a0a0] uppercase tracking-wider">Controls</h2>
          <button
            onClick={() => onToggle(false)}
            className="flex items-center justify-center w-7 h-7 rounded-md text-[#666] hover:text-white hover:bg-[#1a1a1a] transition-colors"
            title="Hide sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
