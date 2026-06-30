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
  /** Currently active preset name (highlights the active preset). */
  activePresetName?: string;
  /** Accent color for hover states and recommended badge. Default: "#5ba3e6" */
  accent?: string;
}

export function PresetList<T extends PresetItem>({ presets, onSelect, activePresetName, accent = "#5ba3e6" }: PresetListProps<T>) {
  return (
    <div className="space-y-1.5">
      {presets.map((p) => {
        const isActive = activePresetName === p.name;
        return (
          <button
            key={p.name}
            onClick={() => onSelect(p)}
            className={`group flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
              isActive
                ? "bg-[#262626] border border-[#444]"
                : "hover:bg-[#262626] border border-transparent"
            }`}
          >
            <ChevronRight
              className={`mt-0.5 h-3 w-3 shrink-0 transition-colors ${isActive ? "" : "text-[#555]"}`}
              style={isActive ? { color: accent } : { ["--group-hover-color" as string]: accent }}
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#e6e6e6]">
                {isActive ? (
                  <span style={{ color: accent }}>{p.shortName}</span>
                ) : (
                  <>
                    <span className="group-hover:opacity-0 inline group-hover:hidden">{p.shortName}</span>
                    <span className="hidden group-hover:inline" style={{ color: accent }}>{p.shortName}</span>
                  </>
                )}
                {p.recommended && (
                  <span
                    className="ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                    style={{ backgroundColor: `${accent}1a`, color: accent }}
                  >
                    Best
                  </span>
                )}
                {isActive && (
                  <span
                    className="ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                    style={{ backgroundColor: `${accent}1a`, color: accent }}
                  >
                    Active
                  </span>
                )}
              </p>
              <p className={`text-[10px] leading-tight ${isActive ? "text-[#a0a0a0]" : "text-[#555] group-hover:text-[#a0a0a0]"}`}>
                {p.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
