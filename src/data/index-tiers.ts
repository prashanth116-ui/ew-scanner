/**
 * Index membership tiers for quality-based sorting in the pre-run scanner.
 *
 * Tier 1: S&P 500 — institutional-grade large-cap
 * Tier 2: Nasdaq-100 + S&P 400 MidCap (not already in tier 1) — quality mid/large-cap
 * Tier 3: Everything else — small-cap, speculative
 *
 * Last updated: 2026-07-09 (refresh quarterly after index rebalances)
 */

// prettier-ignore
export const SP500_MEMBERS: Set<string> = new Set([
  "A", "AAPL", "ABBV", "ABNB", "ABT", "ACGL", "ACN", "ADBE", "ADI", "ADM",
  "ADP", "ADSK", "AEE", "AEP", "AES", "AFL", "AIG", "AIZ", "AJG", "AKAM",
  "ALB", "ALGN", "ALL", "ALLE", "AMAT", "AMCR", "AMD", "AME", "AMGN", "AMP",
  "AMT", "AMZN", "ANET", "ANSS", "AON", "AOS", "APA", "APD", "APH", "APO",
  "APP", "APTV", "ARE", "ARES", "ATO", "AVB", "AVGO", "AVY", "AWK", "AXON",
  "AXP", "AZO",
  "BA", "BAC", "BALL", "BAX", "BBY", "BDX", "BEN", "BF.B", "BG", "BIIB",
  "BKNG", "BKR", "BLDR", "BLK", "BMY", "BNY", "BR", "BRK.B", "BRO", "BSX",
  "BX", "BXP",
  "C", "CAG", "CAH", "CARR", "CASY", "CAT", "CB", "CBOE", "CBRE", "CCI",
  "CCL", "CDNS", "CDW", "CEG", "CF", "CFG", "CHD", "CHRW", "CHTR", "CI",
  "CIEN", "CINF", "CL", "CLX", "CMCSA", "CME", "CMG", "CMI", "CMS", "CNC",
  "CNP", "COF", "COHR", "COIN", "COO", "COP", "COR", "COST", "CPAY", "CPRT",
  "CPT", "CRH", "CRL", "CRM", "CRWD", "CSCO", "CSGP", "CSX", "CTAS", "CTSH",
  "CTVA", "CVNA", "CVS", "CVX",
  "D", "DAL", "DASH", "DD", "DDOG", "DE", "DECK", "DELL", "DG", "DGX",
  "DHI", "DHR", "DIS", "DLR", "DLTR", "DOC", "DOV", "DOW", "DPZ", "DRI",
  "DTE", "DUK", "DVA", "DVN", "DXCM",
  "EA", "EBAY", "ECL", "ED", "EFX", "EIX", "EL", "ELV", "EME", "EMR",
  "EOG", "EQIX", "EQR", "EQT", "ERIE", "ES", "ESS", "ETN", "ETR", "EVRG",
  "EW", "EXC", "EXPD", "EXPE", "EXR",
  "F", "FANG", "FAST", "FCX", "FDS", "FDX", "FE", "FFIV", "FICO", "FIS",
  "FISV", "FITB", "FIX", "FLEX", "FOX", "FOXA", "FRT", "FSLR", "FTNT", "FTV",
  "GD", "GDDY", "GE", "GEHC", "GEN", "GEV", "GILD", "GIS", "GL", "GLW",
  "GM", "GNRC", "GOOG", "GOOGL", "GPC", "GPN", "GRMN", "GS", "GWW",
  "HAL", "HAS", "HBAN", "HCA", "HD", "HIG", "HII", "HLT", "HON", "HOOD",
  "HPE", "HPQ", "HRL", "HSIC", "HST", "HSY", "HUBB", "HUM", "HWM",
  "IBKR", "IBM", "ICE", "IDXX", "IEX", "IFF", "INCY", "INTC", "INTU", "INVH",
  "IP", "IQV", "IR", "IRM", "ISRG", "IT", "ITW", "IVZ",
  "J", "JBHT", "JBL", "JCI", "JKHY", "JNJ", "JPM",
  "K", "KDP", "KEY", "KEYS", "KHC", "KIM", "KKR", "KLAC", "KMB", "KMI",
  "KO", "KR", "KVUE",
  "L", "LDOS", "LEN", "LH", "LHX", "LII", "LIN", "LLY", "LMT", "LNT",
  "LOW", "LRCX", "LULU", "LUV", "LVS", "LYB", "LYV",
  "MA", "MAA", "MAR", "MAS", "MCD", "MCHP", "MCK", "MCO", "MDLZ", "MDT",
  "MET", "META", "MGM", "MKC", "MLM", "MMM", "MNST", "MO", "MOS", "MPC",
  "MPWR", "MRK", "MRNA", "MRO", "MS", "MSCI", "MSFT", "MSI", "MTB", "MTD",
  "MU",
  "NCLH", "NDAQ", "NDSN", "NEE", "NEM", "NFLX", "NI", "NKE", "NOC", "NOW",
  "NRG", "NSC", "NTAP", "NTRS", "NUE", "NVDA", "NVR", "NWS", "NWSA", "NXPI",
  "O", "ODFL", "OKE", "OMC", "ON", "ORCL", "ORLY", "OTIS", "OXY",
  "PANW", "PAYX", "PCAR", "PCG", "PEG", "PEP", "PFE", "PFG", "PG", "PGR",
  "PH", "PHM", "PKG", "PLD", "PLTR", "PM", "PNC", "PNR", "PNW", "PODD",
  "PPG", "PPL", "PRU", "PSA", "PSX", "PTC", "PWR", "PYPL",
  "QCOM", "QRVO",
  "RCL", "REG", "REGN", "RF", "RJF", "RL", "RMD", "ROK", "ROL", "ROP",
  "ROST", "RSG", "RTX", "RVTY",
  "SBAC", "SBUX", "SCHW", "SHW", "SJM", "SLB", "SMCI", "SNA", "SNPS", "SO",
  "SOLV", "SPG", "SPGI", "SRE", "STE", "STLD", "STT", "STX", "STZ", "SW",
  "SWK", "SWKS", "SYF", "SYK", "SYY",
  "T", "TAP", "TDG", "TDY", "TECH", "TEL", "TER", "TFC", "TGT", "TJX",
  "TKO", "TMO", "TMUS", "TPL", "TPR", "TRGP", "TRMB", "TROW", "TRV", "TSCO",
  "TSLA", "TSN", "TT", "TTD", "TTWO", "TXN", "TXT", "TYL",
  "UAL", "UBER", "UDR", "UHS", "ULTA", "UNH", "UNP", "UPS", "URI", "USB",
  "V", "VEEV", "VICI", "VLO", "VLTO", "VMC", "VRSK", "VRSN", "VRT", "VRTX",
  "VST", "VTR", "VTRS", "VZ",
  "WAB", "WAT", "WBD", "WDAY", "WDC", "WEC", "WELL", "WFC", "WM", "WMB",
  "WMT", "WRB", "WSM", "WST", "WTW", "WY", "WYNN",
  "XEL", "XOM", "XYL",
  "YUM",
  "ZBH", "ZBRA", "ZTS",
]);

// prettier-ignore
// Updated for June 22, 2026 quarterly rebalance
export const NDX100_MEMBERS: Set<string> = new Set([
  "AAPL", "ABNB", "ADBE", "ADI", "ADP", "ADSK", "AEP", "ALAB", "ALNY", "AMAT",
  "AMD", "AMGN", "AMZN", "ANSS", "APP", "ARM", "ASML", "AVGO", "AZN",
  "BIIB", "BKNG", "BKR",
  "CCEP", "CDNS", "CDW", "CEG", "CMCSA", "COIN", "COST", "CPRT", "CRWD", "CRWV",
  "CSCO", "CSGP",
  "DASH", "DDOG", "DLTR", "DXCM",
  "EA", "EXC",
  "FANG", "FAST", "FTNT",
  "GEHC", "GFS", "GILD", "GOOG", "GOOGL",
  "HON",
  "IDXX", "ILMN", "INTC", "INTU", "ISRG",
  "KDP", "KHC", "KLAC",
  "LIN", "LRCX", "LULU",
  "MAR", "MCHP", "MDLZ", "MELI", "META", "MNST", "MRNA", "MRVL", "MSFT",
  "MSTR", "MU",
  "NBIS", "NFLX", "NVDA", "NXPI",
  "ODFL", "ON", "ORLY",
  "PANW", "PAYX", "PCAR", "PDD", "PEP", "PLTR", "PYPL",
  "QCOM",
  "REGN", "RKLB", "ROP", "ROST",
  "SBUX", "SMCI", "SNPS",
  "TEAM", "TER", "TMUS", "TSLA", "TTD", "TTWO", "TXN",
  "VRTX",
  "WDAY",
  "XEL",
]);

// prettier-ignore
export const SP400_MEMBERS: Set<string> = new Set([
  "ACHC", "ACIW", "ACM", "AEIS", "AFG", "AGCO", "AIT", "ALIT", "ALK", "AMED",
  "AMKR", "AMN", "AN", "ANDE", "ANF", "APG", "APPF", "ARI", "ARMK", "AROC",
  "ARW", "ASB", "ASGN", "ASH", "ATI", "ATKR", "ATR", "AVNT", "AXS", "AYI",
  "AZEK", "AZZ",
  "BBWI", "BC", "BCO", "BECN", "BIO", "BJ", "BKH", "BLKB", "BLD", "BRBR",
  "BRKR", "BRX", "BSM", "BWA", "BXMT",
  "CABO", "CACI", "CALM", "CARG", "CART", "CBSH", "CBT", "CC", "CCK", "CCOI",
  "CCS", "CGNX", "CHE", "CHRD", "CMA", "CMC", "CMPR", "CNM", "CNO", "CNX",
  "COLB", "COOP", "CORT", "CPK", "CR", "CRC", "CROX", "CRUS", "CSL", "CSWI",
  "CUZ", "CVBF", "CW", "CWK", "CYTK",
  "DAN", "DAR", "DCI", "DINO", "DIOD", "DKS", "DLB", "DNLI", "DOCS", "DTM",
  "DUOL", "DXC",
  "EEFT", "ENSG", "EPAM", "EPRT", "EQH", "ESAB", "ESE", "ESNT", "ETSY", "EVR",
  "EWBC", "EXEL", "EXLS", "EXPO", "EXP",
  "FAF", "FBIN", "FCFS", "FELE", "FFIN", "FIVE", "FL", "FLR", "FLS", "FN",
  "FND", "FNF", "FRPT", "FSS", "FULT",
  "G", "GATX", "GBCI", "GEF", "GFL", "GGG", "GH", "GHC", "GKOS", "GLNG",
  "GLOB", "GMS", "GNTX", "GPI", "GTES", "GTY", "GVA",
  "HAE", "HBI", "HEES", "HGV", "HHH", "HI", "HLI", "HLX", "HOMB", "HP",
  "HQY", "HR", "HURN", "HWC", "HXL",
  "IAC", "IBP", "IDCC", "IESC", "IGT", "INFA", "INGR", "INST", "INSW", "IOSP",
  "IPAR", "IRT", "ITCI", "ITT",
  "JBLU", "JHG", "JJSF", "JLL", "JWN",
  "KBR", "KFRC", "KGS", "KNF", "KNSL", "KRG",
  "LBRT", "LECO", "LEG", "LFUS", "LGIH", "LNTH", "LOPE", "LSTR",
  "MAN", "MANH", "MASI", "MAT", "MATX", "MBUU", "MC", "MCRI", "MDGL", "MDU",
  "MEDP", "MIDD", "MKSI", "MLI", "MMS", "MMSI", "MOD", "MOG.A", "MORN", "MPW",
  "MSA", "MTDR", "MTG", "MTH", "MTN", "MUR", "MWA",
  "NBIX", "NFG", "NJR", "NMIH", "NNI", "NOVT", "NSA", "NSIT", "NVT", "NXST",
  "OC", "OGE", "OGN", "OGS", "OHI", "OI", "OII", "OLN", "OMF", "ONB", "OSIS",
  "OSK", "OTTR", "OVV",
  "PAYC", "PBF", "PBH", "PCH", "PEN", "PFSI", "PII", "PINC", "PIPR", "PLNT",
  "PNFP", "PNM", "POOL", "POST", "POWL", "PPC", "PRIM", "PRK", "PRGO", "PSN",
  "PVH",
  "QDEL", "QTWO",
  "R", "RBC", "RBRK", "RDN", "REYN", "REZI", "RGLD", "RH", "RHI", "RHP",
  "RLI", "RMBS", "RNR", "RNST", "ROCK", "ROG", "RPM", "RS", "RXO",
  "SAM", "SCI", "SFBS", "SFM", "SHAK", "SIGI", "SLM", "SM", "SMPL", "SN",
  "SNDR", "SNV", "SON", "SPB", "SPNT", "SPSC", "SPXC", "SR", "SSD", "STAG",
  "STR", "SWN", "SWX", "SYNA",
  "TALO", "TDC", "TDS", "TENB", "TFX", "THC", "THG", "TNET", "TOL", "TPX",
  "TREX", "TRIP", "TRMK", "TRNO", "TTC", "TTMI", "TWST",
  "UFPI", "UMBF", "UNFI", "USFD", "USM", "UTHR",
  "VCEL", "VCTR", "VFC", "VIRT", "VLY", "VMI", "VNO", "VNT", "VOYA", "VRNS",
  "VRTS", "VSCO", "VSH",
  "WAL", "WBS", "WCC", "WDFC", "WEX", "WH", "WHD", "WING", "WK", "WMS",
  "WPC", "WSC", "WSO", "WTFC",
  "XP", "XPO",
  "ZD", "ZI", "ZWS",
]);

// prettier-ignore
export const ADDITIONAL_MEMBERS: Set<string> = new Set([
  // Tech / Software / Cloud
  "TSM", "SNOW", "NET", "MDB", "HUBS", "IOT", "CYBR", "MNDY", "PSTG",
  "TWLO", "OKTA", "NTNX", "GTLB", "S", "ESTC", "TOST", "ZS",
  // Consumer / E-commerce / Platforms
  "SHOP", "SPOT", "RBLX", "DKNG", "ONON", "CAVA",
  "CPNG", "SE", "CHWY", "CELH", "ELF",
  // Fintech / Payments / Crypto
  "NU", "SQ", "SOFI", "AFRM", "CRCL",
  // Social / Media
  "PINS", "SNAP", "RDDT", "ZG", "ROKU", "ZM",
  // Healthcare / Biotech / AI Medicine
  "NVO", "NTRA", "HALO", "INSM",
  "BMRN", "VKTX", "LEGN", "SRPT", "TEM",
  // Industrials / Defense / Aerospace
  "HEI", "BAH", "ASTS",
  // Energy / Materials
  "CCJ", "SCCO", "ENPH", "AA",
  // Large ADRs
  "SAP", "GSK", "BHP", "RIO", "BABA", "JD", "LI", "BIDU",
  // Recent IPOs / High Momentum
  "SPCX", "MDLN", "VIK", "QNT",
  // Notable ex-SP400 (dropped SP400 from scan universe, rescued the best)
  "MANH", "DUOL", "RBRK", "MDGL", "WING", "CROX", "DKS", "ETSY",
  "MOD", "POWL", "IESC", "FND", "NBIX", "UTHR", "CYTK", "LNTH",
  "ITCI", "THC", "SFM", "GLOB", "CART",
  // Other
  "MTCH", "DDOC",
]);

/**
 * Returns the quality tier for a ticker symbol:
 *   1 = S&P 500 (institutional-grade large-cap)
 *   2 = Nasdaq-100 or S&P 400 MidCap (quality mid/large-cap)
 *   3 = Everything else (small-cap, speculative)
 *
 * S&P 500 is checked first so overlapping NDX/SP400 members get tier 1.
 */
export function getTickerTier(symbol: string): 1 | 2 | 3 {
  if (SP500_MEMBERS.has(symbol)) return 1;
  if (NDX100_MEMBERS.has(symbol) || SP400_MEMBERS.has(symbol) || ADDITIONAL_MEMBERS.has(symbol)) return 2;
  return 3;
}
