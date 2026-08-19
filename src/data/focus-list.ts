/**
 * Focus List — the names you would actually trade, separated from the names you scan.
 *
 * The scan universe (~464) and the tradeable universe are different sizes because they
 * answer different questions. The scanners exist to notice a name ENTERING your tradeable
 * set, which is exactly the thing you lose if you shrink the universe to the names you
 * already know. So the universe stays wide and the noise gets filtered here, at the
 * output, where a rejected name is still one query away instead of gone.
 *
 * One list, edited by hand. Add a ticker to see it; delete a ticker to stop seeing it.
 * There is no scoring, no override set and no precedence to remember — membership IS the
 * answer. Anything cleverer than this was more machinery than the problem needs.
 *
 * Isomorphic: no server-only imports, so client pages filter with the same list the
 * nightly Telegram uses.
 *
 * ── Where the starting list came from ────────────────────────────────────────────────
 * Seeded 2026-08-18 by measuring a 1y daily history for all 302 scanned members of the
 * technology, semiconductor, software, health care, financial, consumer discretionary,
 * AI, aerospace, defense and space baskets, then screening on:
 *
 *     ATR% >= 3.0   ·   avg dollar volume >= $300M/day   ·   price >= $15
 *
 * ATR% is the discriminator that matters: below ~3% a 3-5 day swing does not clear its
 * own slippage, which is what most of the SCAN_EXCLUSIONS comments are really saying.
 * The dollar-volume bar is ~2x the $150M universe gate — enough to size in and still get
 * out. Raising it further selects for mega-cap rather than for tradeability and starves
 * every sector except semis and software.
 *
 * 154 names cleared the screen. This list is the top of each sector by tradeability
 * (ATR% x log10 dollar volume), capped per sector so one theme cannot own it — an
 * uncapped global rank comes back ~60% semiconductors, which defeats the point of a
 * rotation-driven system: you would stop seeing the sector that is about to work because
 * it is not the sector that moves most.
 *
 * The rank has NO momentum term, deliberately. A focus list that reads recent performance
 * has to be rebuilt every time the regime turns, and would systematically drop exactly
 * the names that are basing before they run.
 *
 * ── Hand-additions, 2026-08-18 ───────────────────────────────────────────────────────
 * 32 names added on top of the 77-name seed, in three passes. Every one clears the same
 * screen; none was excluded on merit.
 *
 * 21 had been squeezed out by the per-sector cap, which ranks on ATR% and so pushed the
 * large-cap core below higher-beta names in the same basket: semis AVGO, TSM, ASML,
 * QCOM, TXN, ADI; software CRWD, PANW, SNOW, ADBE, CRM, INTU, MDB, ZS, OKTA; consumer
 * discretionary BKNG, ABNB, DASH, MELI, EBAY, LULU.
 *
 * 10 sit in baskets the seed never drew from. Communication services (APP, RDDT, RBLX,
 * SPOT) holds a lot of high-ATR liquid momentum and was simply not in the sector list.
 * FIX and PWR are the datacenter buildout from the construction side — the seed had the
 * chips and the power but not the people pouring the concrete. CEG is the same AI-power
 * trade as VST and NRG but sits in the utilities basket, so the sector filter never saw
 * it. MNST and CELH are consumer staples. CRCL is in NO sector basket at all, so it
 * shows as "Other" on every scanner row — filed under financials here as the closest fit.
 *
 * 1 was a bug, not a judgment: SPCX cleared the screen on every measure ($14.7B/day, the
 * second-heaviest volume in the universe) but the generator required 60 bars of history
 * and SPCX has 46, having listed recently. It vanished into a "could not measure" line.
 * The script now needs only 30 bars and prints unmeasurable names as a loud banner.
 *
 * So several sectors now exceed the generator caps (semis 19, software 22, consumer 14)
 * and five sectors exist that the script does not generate at all. That is expected: the
 * cap governs what the SCRIPT proposes, not what the list holds. Re-running the generator
 * will not reproduce any of these 32 — diff its output, do not overwrite with it.
 *
 * The inline ATR%/volume comments are a record of why each name qualified, not live data.
 * To re-measure: `node scripts/measure-focus-candidates.mjs`. Treat its output as a
 * suggestion to diff against, not a replacement — this list is hand-owned.
 */
// prettier-ignore
export const FOCUS_LIST: Set<string> = new Set([
  // Semiconductors
  "COHR",   // 12.7% ATR    2.3B/d  Coherent
  "ALAB",   // 10.8% ATR    1.5B/d  Astera Labs
  "SNDK",   //  9.9% ATR   23.5B/d  Sandisk
  "CRDO",   //  9.6% ATR    1.2B/d  Credo Technology
  "ARM",    //  8.7% ATR    1.4B/d  Arm Holdings
  "ONTO",   //  8.5% ATR    349M/d  Onto Innovation
  "MRVL",   //  7.8% ATR    4.4B/d  Marvell Technology
  "MU",     //  7.5% ATR   36.4B/d  Micron Technology
  "TER",    //  7.3% ATR    1.3B/d  Teradyne
  "AMKR",   //  7.2% ATR    326M/d  Amkor Technology
  "MTSI",   //  7.1% ATR    422M/d  MACOM Technology
  "INTC",   //  6.9% ATR   11.5B/d  Intel
  "ENTG",   //  6.9% ATR    376M/d  Entegris
  "LRCX",   //  6.7% ATR    3.2B/d  Lam Research
  "MKSI",   //  6.7% ATR    467M/d  MKS Instruments
  "AMAT",   //  6.3% ATR    4.1B/d  Applied Materials
  "AMD",    //  6.1% ATR   13.8B/d  AMD
  "ASX",    //  5.8% ATR    318M/d  ASE Technology
  "MPWR",   //  5.7% ATR    1.1B/d  Monolithic Power
  "KLAC",   //  5.5% ATR    2.3B/d  KLA
  "STM",    //  4.7% ATR    582M/d  STMicroelectronics
  "AVGO",   //  4.3% ATR    7.4B/d  Broadcom
  "QCOM",   //  4.1% ATR    1.8B/d  Qualcomm
  "ASML",   //  3.8% ATR    2.7B/d  ASML Holding
  "TXN",    //  3.8% ATR    2.1B/d  Texas Instruments
  "ADI",    //  3.4% ATR    1.4B/d  Analog Devices
  "TSM",    //  3.3% ATR    5.1B/d  Taiwan Semiconductor

  // Software & Cloud
  "DOCN",   //  9.4% ATR    415M/d  DigitalOcean
  "HUBS",   //  9.1% ATR    502M/d  HubSpot
  "DDOG",   //  7.2% ATR    1.3B/d  Datadog
  "IONQ",   //  6.8% ATR    825M/d  IonQ
  "WDAY",   //  6.6% ATR    914M/d  Workday
  "RGTI",   //  6.3% ATR    333M/d  Rigetti Computing
  "TWLO",   //  6.2% ATR    564M/d  Twilio
  "NET",    //  6.1% ATR    1.2B/d  Cloudflare
  "TEAM",   //  6.1% ATR    705M/d  Atlassian
  "FICO",   //  6.0% ATR    435M/d  Fair Isaac
  "NOW",    //  5.3% ATR    2.8B/d  ServiceNow
  "SHOP",   //  5.3% ATR    1.6B/d  Shopify
  "PLTR",   //  5.2% ATR    7.2B/d  Palantir
  "ORCL",   //  5.1% ATR    4.2B/d  Oracle
  "U",      //  5.1% ATR    483M/d  Unity Software
  "MDB",    //  5.0% ATR    562M/d  MongoDB
  "ADBE",   //  4.5% ATR    1.3B/d  Adobe
  "OKTA",   //  4.5% ATR    364M/d  Okta
  "INTU",   //  4.3% ATR    1.2B/d  Intuit
  "ZS",     //  4.2% ATR    367M/d  Zscaler
  "CRM",    //  4.1% ATR    2.3B/d  Salesforce
  "SNOW",   //  4.1% ATR    1.5B/d  Snowflake
  "CRWD",   //  4.1% ATR    1.5B/d  CrowdStrike
  "PANW",   //  3.9% ATR    2.0B/d  Palo Alto Networks
  "MSFT",   //  3.5% ATR   17.3B/d  Microsoft

  // Technology / AI infrastructure
  "NBIS",   // 11.0% ATR    5.7B/d  Nebius Group
  "CRWV",   // 10.6% ATR    3.0B/d  CoreWeave
  "LITE",   // 10.3% ATR    4.3B/d  Lumentum
  "FN",     // 10.1% ATR    479M/d  Fabrinet
  "WDC",    //  9.3% ATR    4.2B/d  Western Digital
  "STX",    //  8.1% ATR    4.6B/d  Seagate Technology
  "GLW",    //  7.1% ATR    2.0B/d  Corning
  "DELL",   //  7.0% ATR    2.6B/d  Dell Technologies
  "FSLR",   //  6.9% ATR    603M/d  First Solar
  "SMCI",   //  6.7% ATR    2.1B/d  Super Micro Computer
  "ANET",   //  5.6% ATR    1.5B/d  Arista Networks
  "MSTR",   //  5.5% ATR    1.5B/d  MicroStrategy

  // AI & power
  "HUT",    // 12.2% ATR    463M/d  Hut 8 Mining
  "BE",     // 12.0% ATR    3.5B/d  Bloom Energy — hand-added to ADDITIONAL_MEMBERS
  "RIOT",   // 11.6% ATR    485M/d  Riot Platforms
  "IREN",   //  9.6% ATR    1.8B/d  IREN — hand-added to ADDITIONAL_MEMBERS
  "OKLO",   //  8.3% ATR    420M/d  Oklo
  "CIEN",   //  8.2% ATR    889M/d  Ciena
  "NRG",    //  6.6% ATR    402M/d  NRG Energy
  "VRT",    //  5.8% ATR    1.6B/d  Vertiv Holdings
  "GEV",    //  4.8% ATR    2.5B/d  GE Vernova
  "VST",    //  4.5% ATR    674M/d  Vistra
  "META",   //  4.2% ATR    9.8B/d  Meta Platforms
  "CEG",    //  4.1% ATR    764M/d  Constellation Energy
  "GOOGL",  //  3.1% ATR   10.6B/d  Alphabet

  // Aerospace, defense & space
  "SPCX",   //  7.5% ATR   14.7B/d  Space Exploration Technologies
  "RKLB",   //  7.5% ATR    1.4B/d  Rocket Lab USA
  "ASTS",   //  8.0% ATR    780M/d  AST SpaceMobile
  "AXON",   //  6.5% ATR    539M/d  Axon Enterprise
  "LHX",    //  3.3% ATR    489M/d  L3Harris Technologies
  "TDG",    //  3.1% ATR    529M/d  TransDigm Group

  // Health care & biotech
  "HIMS",   //  7.0% ATR    453M/d  Hims & Hers Health — hand-added to ADDITIONAL_MEMBERS
  "ALNY",   //  6.5% ATR    521M/d  Alnylam Pharmaceuticals
  "MRNA",   //  6.0% ATR    313M/d  Moderna
  "INSM",   //  5.4% ATR    367M/d  Insmed
  "NTRA",   //  4.7% ATR    387M/d  Natera
  "ZTS",    //  4.4% ATR    516M/d  Zoetis
  "NVO",    //  4.0% ATR    633M/d  Novo Nordisk
  "CNC",    //  4.0% ATR    324M/d  Centene
  "ILMN",   //  3.9% ATR    348M/d  Illumina
  "LLY",    //  3.7% ATR    3.1B/d  Eli Lilly
  "RVMD",   //  3.6% ATR    327M/d  Revolution Medicines
  "MCK",    //  3.5% ATR    871M/d  McKesson
  "BSX",    //  3.3% ATR    947M/d  Boston Scientific
  "UNH",    //  2.5% ATR    1.7B/d  UnitedHealth — below the 3.0% ATR screen, hand-added

  // Financials
  "CRCL",   //  6.5% ATR    715M/d  Circle Internet Group
  "COIN",   //  5.4% ATR    1.1B/d  Coinbase
  "HOOD",   //  4.9% ATR    1.6B/d  Robinhood
  "SOFI",   //  4.2% ATR    1.2B/d  SoFi Technologies
  "KKR",    //  4.3% ATR    543M/d  KKR & Co
  "APO",    //  4.0% ATR    502M/d  Apollo Global Management
  "ARES",   //  4.1% ATR    327M/d  Ares Management
  "BX",     //  3.4% ATR    695M/d  Blackstone
  "XYZ",    //  3.3% ATR    399M/d  Block

  // Consumer discretionary
  "CVNA",   //  6.4% ATR    713M/d  Carvana
  "AMZN",   //  3.8% ATR   12.6B/d  Amazon
  "TSLA",   //  3.2% ATR   12.7B/d  Tesla
  "DKNG",   //  5.2% ATR    327M/d  DraftKings
  "CMG",    //  4.6% ATR    656M/d  Chipotle
  "TPR",    //  4.8% ATR    417M/d  Tapestry
  "SE",     //  4.2% ATR    584M/d  Sea Limited
  "NCLH",   //  4.7% ATR    301M/d  Norwegian Cruise Line
  "MELI",   //  3.8% ATR    843M/d  MercadoLibre
  "DASH",   //  3.7% ATR    886M/d  DoorDash
  "ABNB",   //  3.7% ATR    855M/d  Airbnb
  "BKNG",   //  3.5% ATR    1.2B/d  Booking Holdings
  "EBAY",   //  3.9% ATR    501M/d  eBay
  "LULU",   //  3.5% ATR    309M/d  Lululemon

  // Communication services
  "RDDT",   //  8.1% ATR    1.4B/d  Reddit
  "APP",    //  7.1% ATR    2.8B/d  AppLovin
  "RBLX",   //  7.7% ATR    607M/d  Roblox
  "SPOT",   //  4.9% ATR    1.0B/d  Spotify
  "NFLX",   //  3.0% ATR    2.6B/d  Netflix — just under the 3.0% ATR screen, hand-added

  // Industrials — datacenter buildout
  "MTZ",    //  7.3% ATR    460M/d  MasTec
  "FIX",    //  5.7% ATR    834M/d  Comfort Systems
  "PWR",    //  4.7% ATR    771M/d  Quanta Services

  // Consumer staples
  "MNST",   // 10.9% ATR    511M/d  Monster Beverage
  "CELH",   //  6.6% ATR    362M/d  Celsius Holdings

  // Materials
  "AEM",    //  3.9% ATR    491M/d  Agnico Eagle Mines
]);

/** Is this one of the names you actually trade? */
export function isFocusTicker(ticker: string): boolean {
  return FOCUS_LIST.has(ticker);
}
