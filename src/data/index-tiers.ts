/**
 * Index membership tiers for quality-based sorting in the pre-run scanner.
 *
 * Tier 1: S&P 500 — institutional-grade large-cap
 * Tier 2: Nasdaq-100 or Additional Members (not already in tier 1) — quality mid/large-cap
 * Tier 3: Everything else — small-cap, speculative
 *
 * Last updated: 2026-07-11 (refresh quarterly after index rebalances)
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
// Updated for June 22, 2026 quarterly rebalance + July 7, 2026 SPCX addition
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
  "SBUX", "SMCI", "SNPS", "SPCX",
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
  "TWLO", "OKTA", "NTNX", "GTLB", "S", "ESTC", "TOST", "ZS", "TTAN",
  // Consumer / E-commerce / Platforms
  "SHOP", "SPOT", "RBLX", "DKNG", "ONON", "CAVA",
  "CPNG", "SE", "CHWY",
  // Fintech / Payments / Crypto
  "NU", "XYZ", "SOFI", "AFRM", "CRCL",
  // Social / Media
  "PINS", "SNAP", "RDDT", "ZG", "ROKU", "ZM",
  // Healthcare / Biotech / AI Medicine
  "NVO", "NTRA", "HALO", "INSM",
  "BMRN", "VKTX", "SRPT", "TEM",
  // Industrials / Defense / Aerospace
  "HEI", "BAH", "ASTS",
  // Energy / Materials
  "CCJ", "SCCO", "ENPH", "AA",
  // Large ADRs
  "SAP", "GSK", "BHP", "RIO", "BABA", "JD", "LI", "BIDU",
  // Recent IPOs / High Momentum
  "MDLN", "VIK", "QNT", "IONQ",
  // Notable ex-SP400 (dropped SP400 from scan universe, rescued the best)
  "MANH", "DUOL", "RBRK", "MDGL", "WING", "CROX", "DKS", "ETSY",
  "MOD", "POWL", "IESC", "FND", "NBIX", "UTHR", "CYTK", "LNTH",
  "ITCI", "THC", "SFM", "GLOB", "CART",
  // Other
  "MTCH",
]);

// prettier-ignore
/** Tickers excluded from scan universe. These are SP500/NDX members that are
 *  structurally unlikely to produce swing-tradeable breakouts due to ultra-low
 *  volatility, secular decline, or utility-like price behavior.
 *  Last updated: 2026-07-11. Review quarterly. */
export const SCAN_EXCLUSIONS: Set<string> = new Set([
  // Industrials — low ATR%, utility-like, conglomerate discount, or secular decline
  "ROL",    // Rollins — pest control, ATR% ~1.0-1.5%, never pulls back enough
  "RSG",    // Republic Services — waste hauler, utility-like volatility
  "WM",     // Waste Management — waste monopoly, ATR% ~1.0-1.3%
  "CHRW",   // C.H. Robinson — freight brokerage in secular decline
  "SWK",    // Stanley Black & Decker — multi-year structural decline
  "MMM",    // 3M — litigation overhang, low-growth conglomerate
  "TXT",    // Textron — diversified conglomerate, no catalyst concentration
  "AOS",    // A.O. Smith — water heaters, structurally boring
  "ALLE",   // Allegion — door locks, ultra-stable, low-growth
  "PNR",    // Pentair — water treatment, utility-adjacent
  "NDSN",   // Nordson — precision dispensing, niche low-ATR%
  "DOV",    // Dover — diversified industrial conglomerate
  // Financials — secular decline, low ATR%, or governance risk
  "BEN",    // Franklin Templeton — active management in secular decline
  "IVZ",    // Invesco — same as BEN, persistent AUM outflows
  "GL",     // Globe Life — under investigation, governance risk
  "CINF",   // Cincinnati Financial — utility-like P&C insurer
  "AIZ",    // Assurant — specialty insurance, no momentum profile
  "L",      // Loews — holding company, conglomerate discount
  "NTRS",   // Northern Trust — custody bank, low ATR%
  "PFG",    // Principal Financial — insurance/asset mgmt, low-growth
  "STT",    // State Street — custody bank, low ATR%
  "KEY",    // KeyCorp — generic regional bank, no differentiation
  "RF",     // Regions Financial — generic regional bank
  // Consumer Discretionary — structural challenges, low ATR%, or no breakout DNA
  "F",      // Ford — EV losses, legacy auto margin compression
  "GM",     // General Motors — same as Ford
  "GPC",    // Genuine Parts — auto parts distributor, utility-like
  "HAS",    // Hasbro — toy company in secular decline
  "RL",     // Ralph Lauren — mature luxury brand, low-growth
  "MAS",    // Masco — faucets/cabinets, low ATR%, grinds not breaks
  "TGT",    // Target — big-box retail, low ATR%, gap-driven only
  "LVS",    // Las Vegas Sands — Macau recovery priced in, grinding
  // Health Care — ultra-low ATR%, structural decline, or no catalyst
  "JNJ",    // Johnson & Johnson — utility-like ATR% (~0.9-1.2%)
  "PFE",    // Pfizer — post-COVID cliff, dead money
  "BAX",    // Baxter — turnaround not working, low ATR%
  "VTRS",   // Viatris — generic pharma, structural decline, high debt
  "HSIC",   // Henry Schein — dental supply, low ATR% (~1.1%)
  "CVS",    // CVS Health — too diversified, PBM reform risk, low ATR%
  "DVA",    // DaVita — dialysis, regulatory ceiling, GLP-1 threat
  // Utilities — regulated, ATR% < 1.5%, bond proxies (kept: CEG, VST, NRG, AES, PCG, EXC, SRE, NEE, XEL)
  "AEE",    // Ameren — regulated Midwest utility, ATR% ~1.0%
  "AEP",    // American Electric Power — regulated, ATR% ~1.1%
  "ATO",    // Atmos Energy — gas distribution, ATR% ~1.0%
  "AWK",    // American Water Works — water utility, ATR% ~1.0%
  "CMS",    // CMS Energy — Michigan regulated, ATR% ~1.0%
  "CNP",    // CenterPoint Energy — Gulf Coast utility, ATR% ~1.1%
  "D",      // Dominion Energy — low-growth post-restructuring, ATR% ~1.1%
  "DTE",    // DTE Energy — Michigan utility, ATR% ~1.0%
  "DUK",    // Duke Energy — largest regulated utility, ATR% ~0.9%
  "ED",     // Consolidated Edison — NYC utility, ATR% ~0.8-1.0%
  "EIX",    // Edison International — SoCal, ATR% ~1.2%, fire-season only
  "ES",     // Eversource Energy — New England, ATR% ~1.1%
  "ETR",    // Entergy — Gulf Coast nuclear, ATR% ~1.1%
  "EVRG",   // Evergy — Kansas/Missouri, ATR% ~1.0%
  "FE",     // FirstEnergy — Ohio, past scandal, ATR% ~1.1%
  "LNT",    // Alliant Energy — Iowa/Wisconsin, ATR% ~0.9%
  "NI",     // NiSource — Indiana gas, ATR% ~1.0%
  "PEG",    // Public Service Enterprise — NJ, ATR% ~1.1%
  "PNW",    // Pinnacle West — Arizona, ATR% ~1.0%
  "PPL",    // PPL Corp — Pennsylvania/Kentucky, ATR% ~1.0%
  "SO",     // Southern Company — largest Southeast utility, ATR% ~0.8%
  "WEC",    // WEC Energy — Wisconsin, ATR% ~0.9%
  // Real Estate — traditional REITs, ATR% < 1.5%, rate-driven (kept: EQIX, DLR, AMT, CCI, SBAC, CBRE, CSGP, IRM, PLD, SPG, WELL)
  "ARE",    // Alexandria Real Estate — life science REIT, lab oversupply
  "AVB",    // AvalonBay — apartment REIT, ATR% ~1.2%
  "BXP",    // BXP — office REIT, WFH structural decline
  "CPT",    // Camden Property — apartment REIT, ATR% ~1.2%
  "DOC",    // Healthpeak — healthcare REIT, ATR% ~1.2%
  "EQR",    // Equity Residential — apartment REIT, ATR% ~1.1%
  "ESS",    // Essex Property — West Coast apartments, ATR% ~1.2%
  "EXR",    // Extra Space Storage — self-storage REIT, ATR% ~1.2%
  "FRT",    // Federal Realty — retail REIT, ATR% ~1.3%
  "HST",    // Host Hotels — hotel REIT, ATR% ~1.5%, grinding
  "INVH",   // Invitation Homes — single-family rental, ATR% ~1.2%
  "KIM",    // Kimco Realty — retail REIT, ATR% ~1.2%
  "MAA",    // Mid-America Apartment — Sunbelt apartments, ATR% ~1.2%
  "O",      // Realty Income — monthly dividend REIT, ATR% ~0.9%
  "PSA",    // Public Storage — self-storage REIT, ATR% ~1.1%
  "REG",    // Regency Centers — retail REIT, ATR% ~1.1%
  "UDR",    // UDR — apartment REIT, ATR% ~1.2%
  "VICI",   // VICI Properties — casino REIT, triple-net, ATR% ~1.1%
  "VTR",    // Ventas — healthcare REIT, ATR% ~1.3%
  "WY",     // Weyerhaeuser — timber REIT, ATR% ~1.3%
  // Consumer Staples — slow-growth dividend aristocrats, ATR% < 1.5%, bond proxies
  "ADM",    // Archer-Daniels-Midland — commodity processor, accounting scandal, ATR% ~1.3%
  "BF.B",   // Brown-Forman — spirits, declining volumes, ATR% ~1.3%
  "CAG",    // Conagra Brands — frozen food, private-label pressure, ATR% ~1.2%
  "CHD",    // Church & Dwight — baking soda/laundry, ultra-stable, ATR% ~1.2%
  "CL",     // Colgate-Palmolive — toothpaste, ATR% ~1.0%, bond proxy
  "CLX",    // Clorox — bleach, ATR% ~1.2%, no growth catalyst
  "GIS",    // General Mills — cereal, ATR% ~1.1%, secular decline in branded food
  "HRL",    // Hormel Foods — packaged meat, ATR% ~1.3%, multi-year decline
  "KHC",    // Kraft Heinz — processed food, ATR% ~1.3%, value trap
  "KMB",    // Kimberly-Clark — diapers/tissue, ATR% ~1.0%, bond proxy
  "MKC",    // McCormick — spices, ATR% ~1.2%, stable but no breakout DNA
  "MO",     // Altria — tobacco, ATR% ~1.1%, secular decline in smoking
  "SJM",    // J.M. Smucker — jelly/pet food, ATR% ~1.3%, low growth
  "TAP",    // Molson Coors — beer, ATR% ~1.3%, market share losses
  // Industrials (second pass) — low ATR%, conglomerate, utility-adjacent
  "EXPD",   // Expeditors International — freight forwarding, ATR% ~1.3%
  "ITW",    // Illinois Tool Works — diversified conglomerate, ATR% ~1.2%
  "OTIS",   // Otis Elevator — elevators/escalators, ATR% ~1.1%, utility-like
  "ROK",    // Rockwell Automation — factory automation, ATR% ~1.4%, multi-year decline
  "SNA",    // Snap-on — tools, ATR% ~1.2%, very low volatility profile
  "UPS",    // United Parcel Service — parcel delivery, ATR% ~1.3%, structural decline
  "WAB",    // Wabtec — rail equipment, ATR% ~1.3%, niche, low momentum
  "XYL",    // Xylem — water tech, ATR% ~1.1%, utility-adjacent
  // Financials (second pass) — generic insurance/banks, low ATR%
  "AFL",    // Aflac — supplemental insurance, ATR% ~1.2%, Japan-dependent
  "AIG",    // AIG — P&C insurance, ATR% ~1.3%, perpetual restructuring
  "ALL",    // Allstate — P&C insurer, ATR% ~1.3%, rate-driven, no breakout DNA
  "MET",    // MetLife — life insurance, ATR% ~1.3%, rate-sensitive, generic
  "PRU",    // Prudential — life/annuity, ATR% ~1.3%, same profile as MET
  "TFC",    // Truist Financial — regional bank, ATR% ~1.3%, merger integration
  "USB",    // U.S. Bancorp — regional bank, ATR% ~1.2%, too-big-to-grow
  // Health Care (second pass) — low ATR%, structural decline
  "BDX",    // Becton Dickinson — med supplies, ATR% ~1.2%, grinds not breaks
  "CAH",    // Cardinal Health — drug distribution, ATR% ~1.2%, low margin commodity
  "DGX",    // Quest Diagnostics — lab testing, ATR% ~1.2%, utility-like
  "HUM",    // Humana — managed care, structural decline from MA rate cuts
  "MDT",    // Medtronic — med devices, ATR% ~1.2%, multi-year underperformance
  // Materials — commodity/packaging, low ATR%, declining
  "AMCR",   // Amcor — packaging, ATR% ~1.2%, low-growth, commodity
  "AVY",    // Avery Dennison — labels, ATR% ~1.3%, niche, low momentum
  "IFF",    // International Flavors — flavors/fragrances, ATR% ~1.3%, high debt
  "IP",     // International Paper — paper/packaging, ATR% ~1.3%, commodity decline
  "LYB",    // LyondellBasell — chemicals, ATR% ~1.3%, cyclical trough, no catalyst
  // Energy — pipeline/oilfield services past peak
  "APA",    // APA Corp — small E&P, structural decline, governance issues
  "HAL",    // Halliburton — oilfield services, ATR% ~1.5%, cycle past peak
  "KMI",    // Kinder Morgan — midstream pipeline, ATR% ~1.0%, utility-like yield play
  // Communication Services — legacy media/telecom, bond proxies
  "FOXA",   // Fox Corp Class A — legacy media, ATR% ~1.3%, dual-share redundant
  "NWS",    // News Corp — publishing, ATR% ~1.3%, old media, low growth
  "NWSA",   // News Corp Class A — same company as NWS, dual share
  "T",      // AT&T — telecom, ATR% ~1.1%, debt-heavy, utility-like yield play
  "VZ",     // Verizon — telecom, ATR% ~1.0%, bond proxy, no growth
  // Technology — legacy hardware, low growth
  "HPE",    // Hewlett Packard Enterprise — server/storage, ATR% ~1.4%, commodity hardware
  "HPQ",    // HP Inc — PCs/printers, ATR% ~1.3%, secular decline
  "NTAP",   // NetApp — storage, ATR% ~1.5%, legacy storage, declining relevance
  // Consumer Discretionary (second pass) — structural decline
  "APTV",   // Aptiv — auto parts/EV wiring, structural decline, EV slowdown
  "NKE",    // Nike — athletic, ATR% ~1.4%, multi-year decline, DTC transition failing
  "PHM",    // PulteGroup — homebuilder, redundant with DHI/LEN/NVR
]);

/** Build the scan universe: SP500 + NDX100 + ADDITIONAL minus SCAN_EXCLUSIONS. */
export function buildScanUniverse(): string[] {
  const all = new Set([...SP500_MEMBERS, ...NDX100_MEMBERS, ...ADDITIONAL_MEMBERS]);
  for (const t of SCAN_EXCLUSIONS) all.delete(t);
  return [...all];
}

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
