"use client";

import { Search, Loader2, X } from "lucide-react";

interface ScanButtonProps {
  scanning: boolean;
  onScan: () => void;
  onCancel: () => void;
  label?: string;
  cancelLabel?: string;
  disabled?: boolean;
  accentColor?: string;
}

export function ScanButton({
  scanning,
  onScan,
  onCancel,
  label = "Scan",
  disabled,
  accentColor = "#5ba3e6",
}: ScanButtonProps) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onScan}
        disabled={scanning || disabled}
        className="flex-1 flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-colors"
        style={{ backgroundColor: accentColor }}
      >
        {scanning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Search className="h-4 w-4" />
        )}
        {scanning ? "Scanning..." : label}
      </button>
      {scanning && (
        <button
          onClick={onCancel}
          className="rounded-md border border-[#2a2a2a] px-3 py-2.5 text-sm text-[#a0a0a0] hover:text-white hover:border-[#444] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
