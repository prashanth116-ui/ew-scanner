/** Pre-Run Scanner Universe — organized by sector bucket. */

export const SCAN_UNIVERSE: Record<string, string[]> = {
  "AI Optical/Connectivity Semis": [
    "HIMX", "INDI", "ALGM", "FORM", "COHU", "MTSI", "DIOD", "POWI", "SITM", "AEHR", "LASR", "UCTT",
  ],
  "Advanced Packaging/Test": [
    "AMKR", "CAMT", "ICHR", "KLIC", "ACLS", "ONTO", "PRDO",
  ],
  "SiC/GaN Power Semis": [
    "WOLF", "AEIS", "VICR", "MPWR",
  ],
  "Beaten-Down Cloud/SaaS": [
    "CRM", "DDOG", "SNOW", "GTLB", "ESTC", "MDB", "CFLT", "HUBS", "ZS", "OKTA",
  ],
  "Beaten-Down Biotech": [
    "MRNA", "BNTX", "NVAX", "IONS", "EXEL", "BMRN", "RXRX", "SEER", "PACB",
  ],
  "Energy/LNG Turnarounds": [
    "LNG", "AR", "TELL", "NFE", "NEXT", "RRC", "CTRA",
  ],
  "Nuclear/Power Neoclouds": [
    "SMR", "NNE", "CEG", "VST", "TLN", "RKLB",
  ],
  "Rare Earth/Critical Minerals": [
    "UUUU", "REX",
  ],
  "EV/Hydrogen Turnarounds": [
    "FCEL", "BLDP", "BLNK", "CHPT", "EVGO", "ACHR",
  ],
  "High Short Interest": [
    "GME", "AMC", "UPST", "SOFI", "HOOD", "LCID", "RIVN", "BYND",
  ],
  "Rental/Travel": [
    "CAR",
  ],
};

/** Get all unique tickers from all sector buckets. */
export function getAllPreRunTickers(): string[] {
  const set = new Set<string>();
  for (const tickers of Object.values(SCAN_UNIVERSE)) {
    for (const t of tickers) set.add(t);
  }
  return Array.from(set).sort();
}

/** Get tickers for a specific sector bucket. */
export function getTickersForSector(sector: string): string[] {
  if (sector === "All") return getAllPreRunTickers();
  return SCAN_UNIVERSE[sector] ?? [];
}

/** Get sector bucket names. */
export function getSectorBuckets(): string[] {
  return Object.keys(SCAN_UNIVERSE);
}

/** Find which sector a ticker belongs to. */
export function getSectorForTicker(ticker: string): string {
  for (const [sector, tickers] of Object.entries(SCAN_UNIVERSE)) {
    if (tickers.includes(ticker)) return sector;
  }
  return "Other";
}
