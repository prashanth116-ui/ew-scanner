/**
 * Catalyst Scanner universe: ~75 AI infrastructure tickers across 11 layers.
 * Each ticker is tagged with a layer, tier (1-3), and sector ETF for scoring.
 */

export type CatalystLayer =
  | "ai-chips"
  | "ai-servers"
  | "ai-networking"
  | "ai-optics"
  | "ai-power"
  | "ai-builders"
  | "ai-software"
  | "semi-equipment"
  | "commodities"
  | "defense-ai"
  | "robotics";

export const LAYER_LABELS: Record<CatalystLayer, string> = {
  "ai-chips": "AI Chips",
  "ai-servers": "AI Servers",
  "ai-networking": "AI Networking",
  "ai-optics": "AI Optics",
  "ai-power": "AI Power",
  "ai-builders": "AI Builders",
  "ai-software": "AI Software",
  "semi-equipment": "Semi Equipment",
  commodities: "Commodities",
  "defense-ai": "Defense AI",
  robotics: "Robotics",
};

export interface CatalystTicker {
  symbol: string;
  name: string;
  layer: CatalystLayer;
  layerLabel: string;
  tier: 1 | 2 | 3;
  sectorETF: string;
}

const UNIVERSE: CatalystTicker[] = [
  // ── AI Chips (Tier 1-3) ──
  { symbol: "NVDA", name: "NVIDIA", layer: "ai-chips", layerLabel: "AI Chips", tier: 1, sectorETF: "SMH" },
  { symbol: "AMD", name: "Advanced Micro Devices", layer: "ai-chips", layerLabel: "AI Chips", tier: 1, sectorETF: "SMH" },
  { symbol: "AVGO", name: "Broadcom", layer: "ai-chips", layerLabel: "AI Chips", tier: 1, sectorETF: "SMH" },
  { symbol: "INTC", name: "Intel", layer: "ai-chips", layerLabel: "AI Chips", tier: 2, sectorETF: "SMH" },
  { symbol: "QCOM", name: "Qualcomm", layer: "ai-chips", layerLabel: "AI Chips", tier: 2, sectorETF: "SMH" },
  { symbol: "MU", name: "Micron Technology", layer: "ai-chips", layerLabel: "AI Chips", tier: 1, sectorETF: "SMH" },
  { symbol: "MRVL", name: "Marvell Technology", layer: "ai-chips", layerLabel: "AI Chips", tier: 2, sectorETF: "SMH" },
  { symbol: "ARM", name: "Arm Holdings", layer: "ai-chips", layerLabel: "AI Chips", tier: 2, sectorETF: "SMH" },
  { symbol: "MCHP", name: "Microchip Technology", layer: "ai-chips", layerLabel: "AI Chips", tier: 3, sectorETF: "SMH" },
  { symbol: "ON", name: "ON Semiconductor", layer: "ai-chips", layerLabel: "AI Chips", tier: 3, sectorETF: "SMH" },

  // ── AI Servers (Tier 1-2) ──
  { symbol: "DELL", name: "Dell Technologies", layer: "ai-servers", layerLabel: "AI Servers", tier: 1, sectorETF: "IGV" },
  { symbol: "SMCI", name: "Super Micro Computer", layer: "ai-servers", layerLabel: "AI Servers", tier: 1, sectorETF: "IGV" },
  { symbol: "HPE", name: "Hewlett Packard Enterprise", layer: "ai-servers", layerLabel: "AI Servers", tier: 2, sectorETF: "IGV" },
  { symbol: "VRT", name: "Vertiv Holdings", layer: "ai-servers", layerLabel: "AI Servers", tier: 2, sectorETF: "IGV" },
  { symbol: "NTAP", name: "NetApp", layer: "ai-servers", layerLabel: "AI Servers", tier: 2, sectorETF: "IGV" },
  { symbol: "IBM", name: "IBM", layer: "ai-servers", layerLabel: "AI Servers", tier: 2, sectorETF: "IGV" },
  { symbol: "CLS", name: "Celestica", layer: "ai-servers", layerLabel: "AI Servers", tier: 2, sectorETF: "IGV" },

  // ── AI Networking (Tier 1-3) ──
  { symbol: "ANET", name: "Arista Networks", layer: "ai-networking", layerLabel: "AI Networking", tier: 1, sectorETF: "IGV" },
  { symbol: "CSCO", name: "Cisco Systems", layer: "ai-networking", layerLabel: "AI Networking", tier: 2, sectorETF: "IGV" },
  { symbol: "JNPR", name: "Juniper Networks", layer: "ai-networking", layerLabel: "AI Networking", tier: 2, sectorETF: "IGV" },
  { symbol: "FFIV", name: "F5 Networks", layer: "ai-networking", layerLabel: "AI Networking", tier: 3, sectorETF: "IGV" },
  { symbol: "CALX", name: "Calix", layer: "ai-networking", layerLabel: "AI Networking", tier: 3, sectorETF: "IGV" },

  // ── AI Optics (Tier 1-3) ──
  { symbol: "COHR", name: "Coherent Corp", layer: "ai-optics", layerLabel: "AI Optics", tier: 1, sectorETF: "SMH" },
  { symbol: "LITE", name: "Lumentum Holdings", layer: "ai-optics", layerLabel: "AI Optics", tier: 2, sectorETF: "SMH" },
  { symbol: "FOXF", name: "Fox Factory", layer: "ai-optics", layerLabel: "AI Optics", tier: 2, sectorETF: "SMH" },
  { symbol: "CIEN", name: "Ciena Corporation", layer: "ai-optics", layerLabel: "AI Optics", tier: 2, sectorETF: "SMH" },
  { symbol: "AAOI", name: "Applied Optoelectronics", layer: "ai-optics", layerLabel: "AI Optics", tier: 3, sectorETF: "SMH" },

  // ── AI Power / Infrastructure (Tier 2-3) ──
  { symbol: "VST", name: "Vistra Corp", layer: "ai-power", layerLabel: "AI Power", tier: 2, sectorETF: "XLU" },
  { symbol: "CEG", name: "Constellation Energy", layer: "ai-power", layerLabel: "AI Power", tier: 2, sectorETF: "XLU" },
  { symbol: "NRG", name: "NRG Energy", layer: "ai-power", layerLabel: "AI Power", tier: 2, sectorETF: "XLU" },
  { symbol: "FSLR", name: "First Solar", layer: "ai-power", layerLabel: "AI Power", tier: 3, sectorETF: "XLU" },
  { symbol: "GEV", name: "GE Vernova", layer: "ai-power", layerLabel: "AI Power", tier: 2, sectorETF: "XLU" },
  { symbol: "EQIX", name: "Equinix", layer: "ai-power", layerLabel: "AI Power", tier: 2, sectorETF: "XLU" },
  { symbol: "DLR", name: "Digital Realty", layer: "ai-power", layerLabel: "AI Power", tier: 2, sectorETF: "XLU" },
  { symbol: "TLN", name: "Talen Energy", layer: "ai-power", layerLabel: "AI Power", tier: 3, sectorETF: "XLU" },

  // ── AI Builders / Hyperscalers (Tier 1) ──
  { symbol: "MSFT", name: "Microsoft", layer: "ai-builders", layerLabel: "AI Builders", tier: 1, sectorETF: "IGV" },
  { symbol: "GOOGL", name: "Alphabet", layer: "ai-builders", layerLabel: "AI Builders", tier: 1, sectorETF: "IGV" },
  { symbol: "AMZN", name: "Amazon", layer: "ai-builders", layerLabel: "AI Builders", tier: 1, sectorETF: "IGV" },
  { symbol: "META", name: "Meta Platforms", layer: "ai-builders", layerLabel: "AI Builders", tier: 1, sectorETF: "IGV" },
  { symbol: "ORCL", name: "Oracle", layer: "ai-builders", layerLabel: "AI Builders", tier: 1, sectorETF: "IGV" },

  // ── AI Software / SaaS (Tier 1-2) ──
  { symbol: "CRM", name: "Salesforce", layer: "ai-software", layerLabel: "AI Software", tier: 1, sectorETF: "IGV" },
  { symbol: "NOW", name: "ServiceNow", layer: "ai-software", layerLabel: "AI Software", tier: 1, sectorETF: "IGV" },
  { symbol: "SNOW", name: "Snowflake", layer: "ai-software", layerLabel: "AI Software", tier: 2, sectorETF: "IGV" },
  { symbol: "PLTR", name: "Palantir Technologies", layer: "ai-software", layerLabel: "AI Software", tier: 2, sectorETF: "IGV" },
  { symbol: "CRWD", name: "CrowdStrike", layer: "ai-software", layerLabel: "AI Software", tier: 1, sectorETF: "HACK" },
  { symbol: "PANW", name: "Palo Alto Networks", layer: "ai-software", layerLabel: "AI Software", tier: 1, sectorETF: "HACK" },
  { symbol: "DDOG", name: "Datadog", layer: "ai-software", layerLabel: "AI Software", tier: 2, sectorETF: "IGV" },
  { symbol: "MDB", name: "MongoDB", layer: "ai-software", layerLabel: "AI Software", tier: 2, sectorETF: "IGV" },
  { symbol: "ADBE", name: "Adobe", layer: "ai-software", layerLabel: "AI Software", tier: 1, sectorETF: "IGV" },
  { symbol: "WDAY", name: "Workday", layer: "ai-software", layerLabel: "AI Software", tier: 2, sectorETF: "IGV" },
  { symbol: "HUBS", name: "HubSpot", layer: "ai-software", layerLabel: "AI Software", tier: 2, sectorETF: "IGV" },
  { symbol: "NET", name: "Cloudflare", layer: "ai-software", layerLabel: "AI Software", tier: 2, sectorETF: "IGV" },
  { symbol: "AI", name: "C3.ai", layer: "ai-software", layerLabel: "AI Software", tier: 3, sectorETF: "IGV" },
  { symbol: "ZS", name: "Zscaler", layer: "ai-software", layerLabel: "AI Software", tier: 2, sectorETF: "HACK" },
  { symbol: "FTNT", name: "Fortinet", layer: "ai-software", layerLabel: "AI Software", tier: 2, sectorETF: "HACK" },
  { symbol: "S", name: "SentinelOne", layer: "ai-software", layerLabel: "AI Software", tier: 3, sectorETF: "HACK" },
  { symbol: "PATH", name: "UiPath", layer: "ai-software", layerLabel: "AI Software", tier: 3, sectorETF: "IGV" },

  // ── Semi Equipment (Tier 1-2) ──
  { symbol: "AMAT", name: "Applied Materials", layer: "semi-equipment", layerLabel: "Semi Equipment", tier: 1, sectorETF: "SMH" },
  { symbol: "LRCX", name: "Lam Research", layer: "semi-equipment", layerLabel: "Semi Equipment", tier: 1, sectorETF: "SMH" },
  { symbol: "KLAC", name: "KLA Corporation", layer: "semi-equipment", layerLabel: "Semi Equipment", tier: 1, sectorETF: "SMH" },
  { symbol: "ASML", name: "ASML Holding", layer: "semi-equipment", layerLabel: "Semi Equipment", tier: 1, sectorETF: "SMH" },
  { symbol: "TSM", name: "TSMC", layer: "semi-equipment", layerLabel: "Semi Equipment", tier: 1, sectorETF: "SMH" },

  // ── Commodities / Materials (Tier 3) ──
  { symbol: "FCX", name: "Freeport-McMoRan", layer: "commodities", layerLabel: "Commodities", tier: 3, sectorETF: "XME" },
  { symbol: "NEM", name: "Newmont Corporation", layer: "commodities", layerLabel: "Commodities", tier: 3, sectorETF: "XME" },
  { symbol: "AA", name: "Alcoa Corporation", layer: "commodities", layerLabel: "Commodities", tier: 3, sectorETF: "XME" },
  { symbol: "SCCO", name: "Southern Copper", layer: "commodities", layerLabel: "Commodities", tier: 3, sectorETF: "XME" },
  { symbol: "CLF", name: "Cleveland-Cliffs", layer: "commodities", layerLabel: "Commodities", tier: 3, sectorETF: "XME" },
  { symbol: "MP", name: "MP Materials", layer: "commodities", layerLabel: "Commodities", tier: 3, sectorETF: "XME" },

  // ── Defense AI (Tier 2-3) ──
  { symbol: "LMT", name: "Lockheed Martin", layer: "defense-ai", layerLabel: "Defense AI", tier: 2, sectorETF: "ITA" },
  { symbol: "RTX", name: "RTX Corporation", layer: "defense-ai", layerLabel: "Defense AI", tier: 2, sectorETF: "ITA" },
  { symbol: "NOC", name: "Northrop Grumman", layer: "defense-ai", layerLabel: "Defense AI", tier: 3, sectorETF: "ITA" },
  { symbol: "LDOS", name: "Leidos Holdings", layer: "defense-ai", layerLabel: "Defense AI", tier: 3, sectorETF: "ITA" },

  // ── Robotics / Automation (Tier 2-3) ──
  { symbol: "ISRG", name: "Intuitive Surgical", layer: "robotics", layerLabel: "Robotics", tier: 2, sectorETF: "ROBO" },
  { symbol: "ROK", name: "Rockwell Automation", layer: "robotics", layerLabel: "Robotics", tier: 3, sectorETF: "ROBO" },
  { symbol: "TER", name: "Teradyne", layer: "robotics", layerLabel: "Robotics", tier: 2, sectorETF: "ROBO" },
  { symbol: "IRBT", name: "iRobot", layer: "robotics", layerLabel: "Robotics", tier: 3, sectorETF: "ROBO" },
  { symbol: "ABBNY", name: "ABB Ltd", layer: "robotics", layerLabel: "Robotics", tier: 2, sectorETF: "ROBO" },
  { symbol: "FANUY", name: "Fanuc Corp", layer: "robotics", layerLabel: "Robotics", tier: 3, sectorETF: "ROBO" },
];

/** Get the full catalyst universe. */
export function getCatalystUniverse(): CatalystTicker[] {
  return UNIVERSE;
}

/** Get all tickers in a specific layer. */
export function getTickersByLayer(layer: CatalystLayer): CatalystTicker[] {
  return UNIVERSE.filter((t) => t.layer === layer);
}

/** Get all peer tickers in the same layer as the given symbol (excluding self). */
export function getLayerPeers(symbol: string): CatalystTicker[] {
  const ticker = UNIVERSE.find((t) => t.symbol === symbol);
  if (!ticker) return [];
  return UNIVERSE.filter((t) => t.layer === ticker.layer && t.symbol !== symbol);
}

/** Get the sector ETF for a given symbol. */
export function getLayerETF(symbol: string): string | null {
  const ticker = UNIVERSE.find((t) => t.symbol === symbol);
  return ticker?.sectorETF ?? null;
}

/** Get all unique sector ETFs used in the universe. */
export function getAllSectorETFs(): string[] {
  return [...new Set(UNIVERSE.map((t) => t.sectorETF))];
}

/** Get all unique layer values. */
export function getAllLayers(): CatalystLayer[] {
  return [...new Set(UNIVERSE.map((t) => t.layer))];
}

/** Get all ticker symbols. */
export function getAllCatalystSymbols(): string[] {
  return UNIVERSE.map((t) => t.symbol);
}

/** Look up a ticker in the universe. */
export function getCatalystTicker(symbol: string): CatalystTicker | undefined {
  return UNIVERSE.find((t) => t.symbol === symbol);
}
