/** Export/import helpers for localStorage-backed data. */

/** Download a JSON blob as a file. */
export function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Prompt user to select a JSON file and return parsed contents. */
export function uploadJson<T>(): Promise<T | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const text = await file.text();
        resolve(JSON.parse(text) as T);
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}

/** Export all EW Scanner data from localStorage. */
export function exportAllData(): Record<string, unknown> {
  const keys = [
    "ew-saved-scans",
    "ew-watchlists",
    "ew-custom-universes",
    "squeeze-saved-scans",
    "squeeze-watchlists",
    "prerun-scan-results",
    "prerun-watchlist",
    "prerun-changelog",
  ];
  const data: Record<string, unknown> = { _exportedAt: new Date().toISOString(), _version: 1 };
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) data[key] = JSON.parse(raw);
    } catch {
      // skip corrupt entries
    }
  }
  return data;
}

/** Import previously exported data into localStorage. Returns count of keys imported. */
export function importAllData(data: Record<string, unknown>): number {
  let count = 0;
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith("_")) continue; // skip metadata
    try {
      localStorage.setItem(key, JSON.stringify(value));
      count++;
    } catch {
      // skip if quota exceeded
    }
  }
  return count;
}
