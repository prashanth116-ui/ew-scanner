"use client";

import { useState, useSyncExternalStore, useMemo } from "react";
import { Bell, BellOff, X } from "lucide-react";
import type { SectorRotationScore } from "@/lib/sector-rotation/types";
import type { SectorAlert } from "./types";
import { ALERT_STORAGE_KEY } from "./constants";

export function loadAlerts(): SectorAlert[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(ALERT_STORAGE_KEY) ?? "[]");
  } catch { return []; }
}

export function saveAlerts(alerts: SectorAlert[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(alerts));
}

// Module-level store keeps React state and localStorage in sync without
// reading localStorage during render or calling setState in effects.
const listeners = new Set<() => void>();
let cachedAlerts: SectorAlert[] | undefined;
function readAlerts(): SectorAlert[] {
  if (typeof window === "undefined") return [];
  if (!cachedAlerts) cachedAlerts = loadAlerts();
  return cachedAlerts;
}
function writeAlerts(alerts: SectorAlert[]) {
  cachedAlerts = alerts;
  saveAlerts(alerts);
  listeners.forEach((l) => l());
}
function subscribeAlerts(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function AlertPanel({ sectors }: { sectors: SectorRotationScore[] }) {
  const alerts = useSyncExternalStore(subscribeAlerts, readAlerts, () => []);
  const [open, setOpen] = useState(false);

  const triggeredAlerts = useMemo(() => {
    const triggered: string[] = [];
    for (const alert of alerts) {
      if (!alert.enabled) continue;
      const sector = sectors.find((s) => s.etf === alert.sectorEtf);
      if (!sector) continue;
      if (alert.condition === "enters_quadrant" && sector.quadrant === alert.value) {
        triggered.push(`${sector.sector} entered ${alert.value}`);
      }
      if (alert.condition === "acceleration_positive" && sector.acceleration > 0) {
        triggered.push(`${sector.sector} acceleration turned positive`);
      }
      if (alert.condition === "cmf_positive" && sector.cmf20 > 0) {
        triggered.push(`${sector.sector} CMF turned positive`);
      }
    }
    return triggered;
  }, [alerts, sectors]);

  const addAlert = (etf: string, condition: SectorAlert["condition"], value?: string) => {
    const newAlert: SectorAlert = { id: crypto.randomUUID(), sectorEtf: etf, condition, value, enabled: true };
    writeAlerts([...alerts, newAlert]);
  };

  const removeAlert = (id: string) => {
    writeAlerts(alerts.filter((a) => a.id !== id));
  };

  const toggleAlert = (id: string) => {
    writeAlerts(alerts.map((a) => a.id === id ? { ...a, enabled: !a.enabled } : a));
  };

  return (
    <>
      {triggeredAlerts.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-amber-400">
            <Bell className="h-3.5 w-3.5" />
            <span className="font-medium">Alerts triggered:</span>
            {triggeredAlerts.map((t, i) => <span key={`${t}-${i}`} className="text-[#ccc]">{t}</span>)}
          </div>
        </div>
      )}
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1.5 rounded-lg border border-[#333] px-3 py-1.5 text-sm text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white" aria-label="Toggle alerts">
        <Bell className="h-4 w-4" />
        <span className="hidden sm:inline">Alerts{alerts.length > 0 ? ` (${alerts.length})` : ""}</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div className="mx-4 w-full max-w-md rounded-xl border border-[#2a2a2a] bg-[#111] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Sector Alerts</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-[#666] hover:text-white" aria-label="Close alerts"><X className="h-4 w-4" /></button>
            </div>
            {alerts.length > 0 && (
              <div className="space-y-2 mb-4">
                {alerts.map((a) => {
                  const sector = sectors.find((s) => s.etf === a.sectorEtf);
                  return (
                    <div key={a.id} className="flex items-center justify-between rounded border border-[#2a2a2a] px-3 py-2 text-xs">
                      <span className={a.enabled ? "text-white" : "text-[#555]"}>
                        {sector?.sector ?? a.sectorEtf}: {a.condition === "enters_quadrant" ? `enters ${a.value}` : a.condition === "acceleration_positive" ? "accel turns +" : "CMF turns +"}
                      </span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => toggleAlert(a.id)} className="text-[#666] hover:text-white" aria-label="Toggle alert">
                          {a.enabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                        </button>
                        <button type="button" onClick={() => removeAlert(a.id)} className="text-[#666] hover:text-red-400" aria-label="Delete alert"><X className="h-3 w-3" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="border-t border-[#2a2a2a] pt-3">
              <p className="text-xs text-[#888] mb-2">Add alert</p>
              <div className="space-y-2">
                {sectors.slice(0, 14).map((s) => (
                  <div key={s.etf} className="flex items-center gap-2">
                    <span className="text-xs text-white w-16 truncate">{s.etf}</span>
                    <button type="button" onClick={() => addAlert(s.etf, "enters_quadrant", "IMPROVING")} className="rounded border border-[#333] px-2 py-0.5 text-[10px] text-[#888] hover:text-cyan-400 hover:border-cyan-500/30">IMPROVING</button>
                    <button type="button" onClick={() => addAlert(s.etf, "acceleration_positive")} className="rounded border border-[#333] px-2 py-0.5 text-[10px] text-[#888] hover:text-green-400 hover:border-green-500/30">Accel +</button>
                    <button type="button" onClick={() => addAlert(s.etf, "cmf_positive")} className="rounded border border-[#333] px-2 py-0.5 text-[10px] text-[#888] hover:text-green-400 hover:border-green-500/30">CMF +</button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[#555] mt-3">
                Alerts check when you visit this page and are stored in your browser only.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
