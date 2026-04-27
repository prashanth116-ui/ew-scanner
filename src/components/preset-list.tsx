"use client";

import { ChevronRight } from "lucide-react";

/**
 * Shared preset list rendering used by all scanner sidebars.
 * Accepts any preset object with name/shortName/description and optional recommended flag.
 */
interface PresetItem {
  name: string;
  shortName: string;
  description: string;
  recommended?: boolean;
}

interface PresetListProps<T extends PresetItem> {
  presets: T[];
  onSelect: (preset: T) => void;
  /** Accent color for hover states and recommended badge. Default: "#5ba3e6" */
  accent?: string;
}

export function PresetList<T extends PresetItem>({ presets, onSelect, accent = "#5ba3e6" }: PresetListProps<T>) {
  return (
    <div className="space-y-1.5">
      {presets.map((p) => (
        <button
          key={p.name}
          onClick={() => onSelect(p)}
          className="group flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[#262626]"
        >
          <ChevronRight
            className="mt-0.5 h-3 w-3 shrink-0 text-[#555] transition-colors"
            style={{ ["--group-hover-color" as string]: accent }}
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#e6e6e6]">
              <span className="group-hover:opacity-0 inline group-hover:hidden">{p.shortName}</span>
              <span className="hidden group-hover:inline" style={{ color: accent }}>{p.shortName}</span>
              {p.recommended && (
                <span
                  className="ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                  style={{ backgroundColor: `${accent}1a`, color: accent }}
                >
                  Best
                </span>
              )}
            </p>
            <p className="text-[10px] leading-tight text-[#555] group-hover:text-[#a0a0a0]">
              {p.description}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
