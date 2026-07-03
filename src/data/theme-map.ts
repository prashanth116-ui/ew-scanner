import type { ThemeDefinition } from "@/lib/policy-pulse/types";

export const THEME_MAP: ThemeDefinition[] = [
  {
    id: "tariff",
    label: "Tariffs & Trade",
    keywords: ["import duty", "trade deal", "trade agreement", "trade deficit", "customs duty", "trade policy", "protectionism", "retaliatory tariff"],
    strongKeywords: ["tariff", "trade war", "import duty", "tariffs"],
    tickers: ["AAPL", "TSLA", "NKE", "DE", "F", "GM", "CAT", "BA"],
    etfs: ["EEM", "FXI"],
  },
  {
    id: "china-trade",
    label: "China Relations",
    keywords: ["china trade", "us-china", "chinese imports", "tech transfer", "rare earth", "tiktok", "huawei"],
    strongKeywords: ["china ban", "entity list", "decoupling", "china tariff", "china sanction"],
    tickers: ["NVDA", "AVGO", "QCOM", "BABA", "AAPL", "MU", "LRCX", "AMAT"],
    etfs: ["FXI", "KWEB"],
  },
  {
    id: "fda-approval",
    label: "FDA & Biotech",
    keywords: ["drug approval", "clinical data", "phase 3", "phase 2", "biotech", "pharmaceutical", "orphan drug", "pdufa"],
    strongKeywords: ["fda approval", "fda reject", "clinical trial", "fda clearance", "fda advisory"],
    tickers: ["PFE", "JNJ", "MRK", "LLY", "ABBV", "AMGN", "GILD", "BMY"],
    etfs: ["XBI", "IBB"],
  },
  {
    id: "energy-policy",
    label: "Energy Policy",
    keywords: ["oil price", "natural gas", "renewable energy", "carbon tax", "pipeline", "refinery", "opec", "solar subsidy"],
    strongKeywords: ["drilling ban", "oil embargo", "lng export", "energy independence", "strategic petroleum reserve"],
    tickers: ["XOM", "CVX", "OXY", "COP", "FSLR", "ENPH", "SLB", "HAL"],
    etfs: ["XLE", "XOP", "TAN"],
  },
  {
    id: "rate-policy",
    label: "Fed & Rates",
    keywords: ["federal reserve", "interest rate", "monetary policy", "inflation target", "quantitative tightening", "bond yield", "treasury"],
    strongKeywords: ["rate cut", "rate hike", "fed pivot", "fed pause", "fomc decision", "rate decision"],
    tickers: ["JPM", "GS", "MS", "BAC", "C", "WFC", "SCHW", "BLK"],
    etfs: ["XLF", "TLT", "KRE"],
  },
  {
    id: "fiscal-stimulus",
    label: "Fiscal Stimulus",
    keywords: ["government spending", "budget", "deficit", "fiscal policy", "public works", "debt ceiling"],
    strongKeywords: ["stimulus package", "infrastructure bill", "spending bill", "fiscal stimulus", "relief package"],
    tickers: ["CAT", "VMC", "URI", "MLM", "PWR", "EME", "FAST", "GE"],
    etfs: ["XLI"],
  },
  {
    id: "tech-regulation",
    label: "Tech Regulation",
    keywords: ["tech regulation", "content moderation", "app store", "monopoly", "big tech", "digital markets"],
    strongKeywords: ["antitrust", "data privacy", "section 230", "tech breakup", "antitrust lawsuit"],
    tickers: ["GOOGL", "META", "AMZN", "AAPL", "MSFT", "CRM", "NFLX"],
    etfs: ["XLK", "QQQ"],
  },
  {
    id: "defense-spending",
    label: "Defense & Geopolitics",
    keywords: ["military", "nato", "geopolitical", "conflict", "weapons", "pentagon", "arms deal", "navy"],
    strongKeywords: ["defense budget", "military contract", "defense spending", "war", "invasion"],
    tickers: ["LMT", "RTX", "NOC", "GD", "BA", "HII", "LHX", "TDG"],
    etfs: ["ITA"],
  },
  {
    id: "crypto-regulation",
    label: "Crypto Regulation",
    keywords: ["cryptocurrency", "blockchain", "digital currency", "defi", "crypto exchange", "mining regulation"],
    strongKeywords: ["bitcoin etf", "crypto ban", "stablecoin", "crypto regulation", "sec crypto"],
    tickers: ["COIN", "MSTR", "MARA", "RIOT", "SQ", "PYPL"],
    etfs: ["BITO"],
  },
  {
    id: "semiconductor",
    label: "Chips & Export Controls",
    keywords: ["chip shortage", "fab construction", "wafer", "semiconductor supply", "foundry", "chip manufacturing"],
    strongKeywords: ["chips act", "export control", "semiconductor ban", "chip export", "chip restriction"],
    tickers: ["NVDA", "AMD", "INTC", "TSM", "AVGO", "QCOM", "LRCX", "AMAT", "KLAC", "MU"],
    etfs: ["SMH", "SOXX"],
  },
  {
    id: "ev-green",
    label: "EV & Green Energy",
    keywords: ["electric vehicle", "battery", "charging station", "clean energy", "solar", "wind energy", "carbon neutral"],
    strongKeywords: ["ev mandate", "ev credit", "ev tax credit", "ev subsidy", "clean energy bill"],
    tickers: ["TSLA", "RIVN", "LCID", "ENPH", "FSLR", "LI", "NIO", "GM"],
    etfs: ["QCLN", "LIT"],
  },
  {
    id: "housing",
    label: "Housing & Real Estate",
    keywords: ["real estate", "housing market", "home sales", "construction", "rent", "property"],
    strongKeywords: ["mortgage rate", "housing starts", "housing crisis", "rent control", "housing bill"],
    tickers: ["DHI", "LEN", "Z", "RDFN", "TOL", "PHM", "KBH"],
    etfs: ["XHB", "ITB"],
  },
  {
    id: "labor-market",
    label: "Labor & Employment",
    keywords: ["employment", "labor", "workforce", "wage", "gig economy", "minimum wage"],
    strongKeywords: ["jobs report", "unemployment claims", "hiring freeze", "layoffs", "nonfarm payroll"],
    tickers: ["PAYX", "ADP", "PAYC", "WMT", "AMZN", "TGT"],
    etfs: ["XLY"],
  },
  {
    id: "sanctions",
    label: "Sanctions",
    keywords: ["geopolitical risk", "diplomatic", "foreign policy", "trade restriction", "blocked entity"],
    strongKeywords: ["sanctions", "asset freeze", "embargo", "sanctioned", "economic sanctions"],
    tickers: ["XOM", "CVX", "BP", "HAL"],
    etfs: ["EEM"],
  },
  {
    id: "ai-regulation",
    label: "AI Regulation",
    keywords: ["artificial intelligence", "machine learning", "generative ai", "ai model", "ai chip", "ai computing"],
    strongKeywords: ["ai regulation", "ai executive order", "ai safety", "ai ban", "ai policy", "ai act"],
    tickers: ["NVDA", "MSFT", "GOOGL", "META", "AMD", "PLTR", "CRM", "ORCL"],
    etfs: ["BOTZ", "ROBO"],
  },
];

/** Look up a theme definition by ID. */
export function getThemeById(id: string): ThemeDefinition | undefined {
  return THEME_MAP.find((t) => t.id === id);
}

/** Get theme label by ID, or return the raw ID if not found. */
export function getThemeLabel(id: string): string {
  return THEME_MAP.find((t) => t.id === id)?.label ?? id;
}
