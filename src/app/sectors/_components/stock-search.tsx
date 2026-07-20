"use client";

import { useState, useMemo, useRef } from "react";
import { Search, X } from "lucide-react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import type { StockInSector } from "./types";
import { rsColor, rsAccelColor } from "./helpers";

export function StockSearch({ allStocks }: { allStocks: StockInSector[] }) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 200);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (debouncedQuery.length < 1) return [];
    const q = debouncedQuery.toUpperCase();
    return allStocks
      .filter((s) => s.ticker.includes(q) || s.companyName.toUpperCase().includes(q))
      .slice(0, 10);
  }, [debouncedQuery, allStocks]);

  const showResults = focused && results.length > 0;

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-1.5">
        <Search className="h-4 w-4 text-[#666]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder="Search any stock..."
          className="bg-transparent text-sm text-white placeholder:text-[#555] outline-none w-32 sm:w-48"
        />
        {query && (
          <button type="button" onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="text-[#666] hover:text-white" aria-label="Clear search">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {showResults && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-[#2a2a2a] bg-[#111] py-1 shadow-xl max-h-80 overflow-y-auto">
          {results.map((s) => (
            <a key={s.ticker} href={`https://finance.yahoo.com/quote/${encodeURIComponent(s.ticker)}/`} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2 text-xs hover:bg-[#1a1a1a] transition-colors">
              <div>
                <span className="font-semibold text-white">{s.ticker}</span>
                <span className="ml-2 text-[#666]">{s.companyName}</span>
                <span className="ml-2 rounded-full bg-[#2a2a2a] px-1.5 py-0.5 text-[10px] text-[#888]">{s.sectorName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={rsColor(s.rs20d)}>{s.rs20d !== null ? `${s.rs20d > 0 ? "+" : ""}${s.rs20d.toFixed(1)}%` : ""}</span>
                <span className={rsAccelColor(s.rsAccel)}>{s.rsAccel !== null ? `${s.rsAccel > 0 ? "+" : ""}${s.rsAccel.toFixed(1)}` : ""}</span>
                {s.aboveSma50 === true ? <span className="h-2 w-2 rounded-full bg-green-400" /> : s.aboveSma50 === false ? <span className="h-2 w-2 rounded-full bg-red-400" /> : null}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
