"use client";

import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { downloadJson, uploadJson, exportAllData, importAllData } from "@/lib/data-io";

export function DataManager() {
  const [status, setStatus] = useState<string | null>(null);

  const handleExport = () => {
    try {
      const data = exportAllData();
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadJson(data, `ew-scanner-backup-${dateStr}.json`);
      setStatus("Exported successfully");
      setTimeout(() => setStatus(null), 3000);
    } catch {
      setStatus("Export failed");
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const handleImport = async () => {
    const data = await uploadJson<Record<string, unknown>>();
    if (!data) return;
    if (!data._version) {
      setStatus("Invalid backup file");
      setTimeout(() => setStatus(null), 3000);
      return;
    }
    const count = importAllData(data);
    setStatus(`Imported ${count} items — reload to see changes`);
    setTimeout(() => setStatus(null), 5000);
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleExport}
        className="flex items-center gap-1.5 text-xs text-[#555] transition-colors hover:text-[#a0a0a0]"
        aria-label="Export all data as JSON backup"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Export
      </button>
      <button
        onClick={handleImport}
        className="flex items-center gap-1.5 text-xs text-[#555] transition-colors hover:text-[#a0a0a0]"
        aria-label="Import data from JSON backup"
      >
        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
        Import
      </button>
      {status && (
        <span className="text-xs text-[#5ba3e6]">{status}</span>
      )}
    </div>
  );
}
