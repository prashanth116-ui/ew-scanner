"use client";

import { Search, Loader2 } from "lucide-react";

interface TickerSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  searching: boolean;
  error?: string | null;
  placeholder?: string;
  accentColor?: string;
}

export function TickerSearchInput({
  value,
  onChange,
  onSearch,
  searching,
  error,
  placeholder = "e.g. AAPL, TSLA...",
  accentColor = "#5ba3e6",
}: TickerSearchInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder={placeholder}
          className="flex-1 rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1.5 text-sm text-white placeholder-[#555] focus:outline-none"
          style={{ borderColor: undefined }}
          onFocus={(e) => (e.target.style.borderColor = accentColor)}
          onBlur={(e) => (e.target.style.borderColor = "#2a2a2a")}
        />
        <button
          onClick={onSearch}
          disabled={searching || !value.trim()}
          className="rounded-md px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50 transition-colors"
          style={{ backgroundColor: accentColor }}
        >
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
