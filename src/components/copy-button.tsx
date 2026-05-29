"use client";

import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";

interface CopyButtonProps {
  tickers: string[];
  className?: string;
}

export function CopyButton({ tickers, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard
      .writeText(tickers.join(", "))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }, [tickers]);

  return (
    <button
      onClick={copy}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-[#a0a0a0] hover:text-white border border-[#2a2a2a] hover:border-[#444] transition-colors"
      }
      title="Copy all visible tickers to clipboard"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-green-400" />
          <span className="text-green-400">Copied {tickers.length}</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span className="hidden sm:inline">Copy Watchlist</span>
        </>
      )}
    </button>
  );
}
