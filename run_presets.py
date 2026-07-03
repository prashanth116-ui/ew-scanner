"""
Run all PreRun preset scanners against the live API and display results.
Usage: python run_presets.py [--preset NAME] [--sector SECTOR]
"""

import json
import sys
import time
import urllib.request
import urllib.error
from typing import Any

API_BASE = "https://quantradar.com"
BATCH_SIZE = 25
BATCH_DELAY = 0.6  # seconds between batches

# All 1,390 tickers from SQUEEZE_UNIVERSE
ALL_TICKERS = [
    "A","AA","AAL","AAON","AAPL","ABBV","ABCB","ABCL","ABM","ABNB","ABT","ACAD","ACGL","ACHC","ACHR","ACIW","ACLS","ACM","ACMR","ACN",
    "ADBE","ADC","ADI","ADM","ADNT","ADP","ADPT","ADSK","AEE","AEHR","AEIS","AEM","AEO","AEP","AES","AFL","AFRM","AGCO","AGNC","AI",
    "AIG","AIN","AIRC","AIT","AIZ","AJG","AKAM","AKR","ALB","ALGM","ALGN","ALGT","ALK","ALKS","ALL","ALLE","ALLO","ALLY","ALNY","ALRM",
    "ALTR","AMAT","AMBA","AMBC","AMC","AMCR","AMD","AME","AMED","AMG","AMGN","AMH","AMKR","AMP","AMT","AMWD","AMZN","AN","ANAB","ANET",
    "ANF","ANSS","AON","AOS","AOSL","APA","APD","APE","APH","APLS","APO","APP","APPF","APPN","APTV","AR","ARCB","ARE","ARES","ARHS",
    "ARKO","ARM","ARMK","ARQT","ARRY","ARWR","ASAN","ASML","ASO","ASPN","ASTE","ASTS","ASX","ATEC","ATKR","ATMU","ATO","ATRC","ATRO","ATVI",
    "AUB","AUPH","AVAV","AVB","AVGO","AVNT","AVPT","AVTR","AVY","AWI","AWK","AWR","AX","AXL","AXON","AXP","AXS","AYX","AZEK","AZN",
    "AZO","AZZ","BA","BABA","BAC","BAH","BALL","BANF","BANR","BASE","BAX","BB","BBBY","BBIO","BBSI","BBWI","BBY","BCC","BCO","BDC",
    "BDX","BEAM","BECN","BEN","BERY","BF.B","BFAM","BG","BGC","BGNE","BGS","BHF","BHP","BHVN","BIDU","BIGC","BIIB","BILI","BILL","BIO",
    "BIPC","BJ","BK","BKH","BKI","BKNG","BKR","BLD","BLDP","BLDR","BLK","BLKB","BLNK","BMBL","BMI","BMRN","BMY","BNL","BNTX","BNZI",
    "BOH","BOOT","BOX","BPMC","BPOP","BR","BRBR","BRK.B","BRKR","BRKS","BRO","BRZE","BSX","BSY","BTU","BURL","BWA","BWXT","BX","BXMT",
    "BXP","BYND","C","CABO","CACI","CAG","CAH","CAKE","CALM","CALX","CAMT","CANO","CAR","CARG","CARR","CART","CAT","CATY","CAVA","CB",
    "CBOE","CBRE","CCI","CCJ","CCK","CCL","CDAY","CDNA","CDNS","CDW","CE","CEG","CELH","CEVA","CF","CFG","CFLT","CG","CGNX","CHD",
    "CHE","CHH","CHPT","CHRD","CHRW","CHTR","CHWY","CI","CINF","CIVI","CL","CLF","CLH","CLOV","CLSK","CLVS","CLX","CMA","CMC","CMCSA",
    "CME","CMG","CMI","CMS","CNA","CNC","CNH","CNK","CNP","CNX","COF","COHR","COHU","COIN","COKE","COLB","COLD","COLM","COMM","COMP",
    "COO","COP","CORT","COST","COTY","COUP","CPAY","CPB","CPNG","CPRT","CPT","CR","CRC","CRDO","CRI","CRL","CRM","CROX","CRSP","CRUS",
    "CRVL","CRWD","CSCO","CSGP","CSL","CSWI","CSX","CTAS","CTLT","CTRA","CTS","CTSH","CTVA","CUBE","CUZ","CVCO","CVNA","CVS","CVX","CW",
    "CWAN","CWST","CYBR","CYTK","CZOO","CZR","D","DAL","DAR","DASH","DAVA","DAY","DBX","DCI","DCPH","DD","DDOG","DE","DEA","DECK",
    "DELL","DFIN","DFS","DG","DGX","DHI","DHR","DINO","DIOD","DIS","DKNG","DKS","DLB","DLO","DLR","DLTR","DLX","DNA","DNB","DNLI",
    "DNOW","DNUT","DOC","DOCN","DOCS","DOCU","DOMO","DORM","DOV","DOW","DOX","DPZ","DRI","DT","DTE","DTST","DUK","DUOL","DV","DVA",
    "DVAX","DVN","DXC","DXCM","EA","EAT","EBAY","ECL","ED","EDIT","EEFT","EFC","EFX","EGP","EHC","EIX","EL","ELAN","ELF","ELV",
    "EME","EMN","EMR","ENOV","ENPH","ENSG","ENTG","ENVX","EOG","EOLS","EPAM","EPD","EPR","EPRT","EQH","EQIX","EQR","EQT","ERIC","ERIE",
    "ES","ESGR","ESRT","ESS","ESTC","ETN","ETR","ETSY","EVBG","EVGO","EVR","EVRG","EW","EWBC","EXAS","EXC","EXEL","EXLS","EXP","EXPD",
    "EXPE","EXPO","EXR","EXTR","F","FAF","FANG","FAST","FATE","FBIN","FCEL","FCFS","FCNCA","FCPT","FCX","FDS","FDX","FE","FFIN","FFIV",
    "FHI","FHN","FI","FICO","FIS","FISV","FITB","FIVE","FIVN","FIX","FL","FLR","FLS","FLWS","FMC","FN","FNB","FND","FNF","FNKO",
    "FNV","FOLD","FORM","FOUR","FOX","FOXA","FR","FROG","FRPT","FRSH","FRT","FSLR","FSV","FTNT","FTV","FUBO","FULT","GATX","GBX","GCT",
    "GD","GDDY","GDRX","GE","GEHC","GEN","GEO","GERN","GES","GEV","GFL","GFS","GGG","GH","GHC","GIII","GIL","GILD","GIS","GKOS",
    "GL","GLBE","GLNG","GLOB","GLPI","GLW","GM","GME","GMED","GNRC","GNTX","GNW","GO","GOEV","GOLD","GOOG","GOOGL","GPC","GPK","GPN",
    "GPS","GRAB","GRMN","GS","GSHD","GSK","GTLB","GWRE","GWW","GXO","HAE","HAIN","HAL","HALO","HAS","HASI","HBAN","HBI","HBM","HCA",
    "HCAT","HD","HEAR","HEI","HELE","HES","HGV","HIG","HII","HIMS","HIMX","HLI","HLIT","HLNE","HLT","HNI","HOG","HOLX","HON","HOOD",
    "HOPE","HPE","HPQ","HQY","HRI","HRL","HRTX","HSIC","HST","HSY","HTZ","HUBB","HUBG","HUBS","HUM","HURN","HUT","HWM","HXL","HYMC",
    "HZNP","IAC","IART","IAS","IBKR","IBM","IBP","ICE","ICFI","ICHR","IDCC","IDXX","IESC","IEX","IFF","IGT","IIPR","ILMN","IMAX","IMVT",
    "INCY","INDI","INGR","INSM","INSP","INSW","INTA","INTC","INTU","INVH","IONQ","IONS","IOSP","IOT","IP","IPAR","IPG","IPGP","IQV","IR",
    "IRBT","IRDM","IREN","IRM","IRTC","IRWD","ISRG","IT","ITCI","ITT","ITW","IVT","IVZ","J","JACK","JAMF","JAZZ","JBHT","JBL","JBT",
    "JCI","JD","JJSF","JKHY","JLL","JNJ","JNPR","JOBY","JPM","K","KAR","KBH","KBR","KD","KDP","KEX","KEY","KEYS","KGS","KHC",
    "KIM","KKR","KLAC","KLIC","KMB","KMI","KMT","KMX","KN","KNSL","KNTK","KNX","KO","KOS","KOSS","KR","KRTX","KRYS","KSS","KTOS",
    "KVUE","KWR","L","LAD","LAMR","LANC","LASR","LBRDK","LBRT","LCID","LDOS","LEA","LECO","LEGN","LEN","LEVI","LFUS","LGIH","LH","LHX",
    "LI","LII","LIN","LITE","LKQ","LLY","LMAT","LMND","LMT","LNC","LNG","LNT","LNTH","LOGI","LOPE","LOW","LPG","LPLA","LPX","LRCX",
    "LSCC","LSI","LSTR","LULU","LUMN","LUNR","LUV","LVS","LW","LXP","LYB","LYFT","LYV","MA","MAA","MAC","MAN","MANH","MAR","MARA",
    "MAS","MAT","MATX","MBIN","MC","MCD","MCHP","MCK","MCO","MDB","MDGL","MDLZ","MDT","MEDP","MELI","MET","META","MGM","MHK","MHO",
    "MIDD","MKC","MKFG","MKSI","MKTX","MLM","MMC","MMM","MMSI","MNDY","MNKD","MNRO","MNST","MO","MOD","MODV","MOH","MOMO","MOS","MOV",
    "MP","MPC","MPW","MPWR","MRCY","MRAM","MRK","MRNA","MRO","MRUS","MRVL","MS","MSA","MSCI","MSFT","MSGS","MSI","MSTR","MTB","MTCH",
    "MTD","MTDR","MTG","MTN","MTSI","MTX","MTZ","MU","MULN","MUR","MVIS","MXL","NABL","NAVI","NBIX","NBR","NCLH","NCNO","NDAQ","NDSN",
    "NEE","NEM","NEOG","NET","NEXT","NFE","NFLX","NGVT","NHI","NI","NICE","NIO","NJR","NKE","NKLA","NKTR","NNE","NNI","NNN","NOC",
    "NOG","NOK","NOV","NOVA","NOVT","NOW","NRG","NSC","NSIT","NTAP","NTES","NTLA","NTNX","NTR","NTRA","NTRS","NU","NUE","NVAX","NVCR",
    "NVDA","NVMI","NVO","NVR","NVST","NWE","NWL","NWS","NWSA","NXPI","NXST","NYT","O","OC","ODFL","OFG","OGE","OGN","OGS","OI",
    "OKE","OKLO","OKTA","OLED","OLLI","OLN","OLO","OMC","OMF","ON","ONON","ONTO","OPCH","OPEN","ORA","ORCL","ORI","ORLY","OSCR","OSK",
    "OTIS","OUT","OVV","OWL","OXY","OZK","PACB","PAGS","PANW","PARA","PATH","PATK","PAYC","PAYO","PAYX","PCAR","PCG","PCOR","PCTY","PCVX",
    "PD","PDD","PDM","PEAK","PECO","PEG","PEN","PENN","PEP","PFBC","PFE","PFG","PFGC","PFSI","PG","PGR","PH","PHG","PHM","PI",
    "PII","PINS","PIPR","PJT","PKG","PKI","PLAB","PLD","PLMR","PLNT","PLTR","PLUG","PLXS","PM","PNC","PNR","PNW","PODD","POOL","POST",
    "POWI","POWL","PPC","PPG","PPL","PRFT","PRGO","PRGS","PRTA","PRU","PSA","PSTG","PSX","PTC","PTCT","PTEN","PVH","PWR","PYPL","PZZA",
    "QCOM","QDEL","QLYS","QRVO","QS","QTWO","R","RAMP","RARE","RBLX","RBRK","RCKT","RCL","RDDT","RDFN","RDNT","REG","REGN","REX","REXR",
    "RF","RGA","RGEN","RGLD","RGR","RGTI","RH","RHI","RHP","RIG","RIO","RIOT","RIVN","RJF","RKLB","RKLY","RL","RMBS","RMD","RNA",
    "RNG","RNST","ROG","ROK","ROKU","ROL","ROP","ROST","RPAY","RPD","RPM","RRC","RRX","RS","RSG","RTX","RUN","RVLV","RVMD","RVTY",
    "RXO","RXRX","S","SABR","SAGE","SAIA","SAIC","SAM","SANM","SAP","SBAC","SBCF","SBRA","SBUX","SCCO","SCHW","SCI","SCSC","SE","SEDG",
    "SEE","SEER","SEIC","SF","SFM","SGRY","SHAK","SHOP","SHW","SIGI","SIMO","SIRI","SITE","SITM","SIX","SJM","SKT","SKX","SLAB","SLB",
    "SLGN","SLM","SMAR","SMCI","SMG","SMMT","SMPL","SMR","SMTC","SN","SNA","SNAP","SNDR","SNOW","SNPS","SNV","SNY","SO","SOFI","SON",
    "SOUN","SPB","SPCE","SPG","SPGI","SPHR","SPLK","SPOT","SPR","SPSC","SPT","SPWR","SPXC","SQ","SQSP","SRC","SRCE","SRE","SRPT","SSNC",
    "SSRM","ST","STAG","STE","STEP","STLD","STM","STNE","STNG","STRA","STT","STWD","STX","STZ","SUI","SUM","SUPN","SWI","SWK","SWKS",
    "SWN","SYBT","SYF","SYK","SYNA","SYY","T","TAK","TAP","TCBI","TDC","TDG","TDOC","TDS","TDY","TEAM","TECH","TECK","TELL","TENB",
    "TER","TEVA","TFC","TFSL","TFX","TGNA","TGT","TGTX","THC","THO","THS","TJX","TKO","TKR","TLN","TLRY","TME","TMHC","TMO","TMUS",
    "TNDM","TNL","TOL","TOST","TPG","TPL","TPR","TREX","TRGP","TRMB","TRMK","TRNO","TROW","TRU","TRV","TSCO","TSLA","TSM","TSN","TT",
    "TTC","TTEC","TTEK","TTWO","TW","TWLO","TWST","TXN","TXRH","TXT","TYL","U","UAL","UBER","UCTT","UDMY","UDR","UFCS","UFPI","UFPT",
    "UHS","UI","ULTA","UMBF","UMC","UNFI","UNH","UNIT","UNM","UNP","UPS","UPST","UPWK","URBN","URI","USAC","USB","USFD","USPH","UTHR",
    "UUUU","V","VALE","VCEL","VCTR","VCYT","VECT","VEEV","VERX","VFC","VIAV","VICI","VICR","VIRT","VITL","VKTX","VLO","VLTO","VLY","VMC",
    "VMEO","VNDA","VOYA","VRNA","VRNS","VRNT","VRSK","VRSN","VRT","VRTX","VSCO","VSH","VST","VTR","VTRS","VZ","W","WAB","WAFD","WAL",
    "WAT","WBA","WBD","WBS","WCC","WDAY","WDC","WDFC","WEC","WELL","WEN","WEX","WFC","WH","WHR","WING","WISA","WISH","WIX","WK",
    "WKC","WKHS","WLK","WM","WMB","WMS","WMT","WOLF","WOOF","WOR","WPC","WPM","WPP","WRB","WRK","WSC","WSM","WSO","WST","WTRG",
    "WTS","WTW","WWD","WY","WYNN","X","XEL","XELA","XNCR","XOM","XPEL","XPEV","XPO","XRAY","XRX","XYL","YETI","YUM","ZBH","ZBRA",
    "ZD","ZETA","ZG","ZI","ZION","ZM","ZS","ZTS","ZUO","ZWS",
]

# Preset definitions matching src/lib/prerun/types.ts
PRESETS = {
    "SNDK Pattern": {
        "desc": "Min 40% from ATH, min 15% SI, score >=18",
        "filters": {"minPctFromAth": 40, "minShortFloat": 15, "minScore": 18},
        "criteria": {},
        "viewMode": "standard",
    },
    "Early Mover": {
        "desc": "Stage 1->2 breakout: EMA timing + higher lows + volume",
        "filters": {"minPctFromAth": 25, "minScore": 14},
        "criteria": {"M2": 1, "L": 1, "F": 1},
        "viewMode": "standard",
    },
    "Pullback Buy": {
        "desc": "20-40% pullbacks from ATH with higher lows + M2 timing + volume",
        "filters": {"maxPctFromAth": 40, "minScore": 15},
        "criteria": {"M2": 1, "F": 1, "L": 1},
        "viewMode": "standard",
    },
    "Leading Sector Scan": {
        "desc": "LEADING/IMPROVING sectors with EMA confirmation (skips ATH gate)",
        "filters": {"minPctFromAth": 0, "minScore": 12},
        "criteria": {"M": 1},
        "skipGate1": True,
        "viewMode": "standard",
    },
    "Stealth Accumulation": {
        "desc": "OBV/VP divergence with EMA timing (institutional buying)",
        "filters": {"minScore": 11},
        "criteria": {"M2": 1},
        "divergence": True,
        "viewMode": "standard",
    },
    "Aggressive Early": {
        "desc": "Pre-breakout: volume divergence + range coil + EMA timing",
        "filters": {"minScore": 10},
        "criteria": {"M2": 1, "N": 1},
        "divergence": True,
        "viewMode": "standard",
    },
    "VCP Breakout": {
        "desc": "Institutional VCP: confirmed uptrend + tight volatility contraction",
        "filters": {},
        "criteria": {},
        "viewMode": "vcp",
        "vcpMinScore": 65,
    },
}


def scan_batch(tickers: list[str], view_mode: str = "standard") -> list[dict]:
    """Call the scan API for a batch of tickers."""
    url = f"{API_BASE}/api/prerun/scan"
    payload = json.dumps({
        "tickers": tickers,
        "emaTimeframe": "1d",
        "viewMode": view_mode,
    }).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
            return data.get("results", [])
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        print(f"  API error {e.code}: {body[:200]}")
        return []
    except Exception as e:
        print(f"  Request failed: {e}")
        return []


def run_full_scan(view_mode: str = "standard") -> list[dict]:
    """Scan all tickers in batches."""
    all_results: list[dict] = []
    total = len(ALL_TICKERS)

    for i in range(0, total, BATCH_SIZE):
        batch = ALL_TICKERS[i : i + BATCH_SIZE]
        pct = min(i + BATCH_SIZE, total)
        print(f"\r  Scanning {pct}/{total} tickers...", end="", flush=True)
        results = scan_batch(batch, view_mode)
        all_results.extend(results)
        if i + BATCH_SIZE < total:
            time.sleep(BATCH_DELAY)

    print(f"\r  Scanned {total}/{total} tickers - {len(all_results)} results")
    return all_results


def get_score(r: dict, key: str) -> float:
    """Safely get a score value."""
    scores = r.get("scores", {})
    return scores.get(key, 0) or 0


def get_data(r: dict, key: str) -> Any:
    """Safely get a data value."""
    data = r.get("data", {})
    return data.get(key)


def apply_preset_filters(results: list[dict], preset: dict) -> list[dict]:
    """Apply preset filters to raw scan results."""
    filters = preset.get("filters", {})
    criteria = preset.get("criteria", {})
    divergence = preset.get("divergence", False)
    view_mode = preset.get("viewMode", "standard")
    vcp_min = preset.get("vcpMinScore", 0)
    skip_gate1 = preset.get("skipGate1", False)

    filtered = []
    for r in results:
        # VCP mode
        if view_mode == "vcp":
            score = get_score(r, "totalScore")
            if vcp_min > 0 and score < vcp_min:
                continue
            filtered.append(r)
            continue

        # Standard mode filters
        min_ath = filters.get("minPctFromAth", 0)
        max_ath = filters.get("maxPctFromAth", 0)
        min_si = filters.get("minShortFloat", 0)
        min_score = filters.get("minScore", 0)

        pct_ath = get_data(r, "pctFromAth") or 0
        si = get_data(r, "shortFloat") or 0

        # When skipGate1, use totalScore (gates may have failed → finalScore=0)
        if skip_gate1:
            score_val = get_score(r, "totalScore")
        else:
            score_val = get_score(r, "finalScore")

        if min_ath > 0 and pct_ath < min_ath:
            continue
        if max_ath > 0 and pct_ath > max_ath:
            continue
        if min_si > 0 and si < min_si:
            continue
        if min_score > 0 and score_val < min_score:
            continue

        # Criteria filters
        scores = r.get("scores", {})
        skip = False
        for crit, min_val in criteria.items():
            score_key = f"score{crit}"
            if scores.get(score_key, 0) < min_val:
                skip = True
                break
        if skip:
            continue

        # Divergence filters (OR logic)
        if divergence:
            data = r.get("data", {})
            obv = data.get("obvDivergent", False)
            vp = data.get("vpDivergenceBullish", False)
            if not obv and not vp:
                continue

        filtered.append(r)

    # Sort by score descending
    score_key_sort = "totalScore" if skip_gate1 or view_mode == "vcp" else "finalScore"
    filtered.sort(key=lambda r: get_score(r, score_key_sort), reverse=True)

    return filtered


def print_standard_results(results: list[dict], max_rows: int = 30, use_total: bool = False):
    """Print standard PreRun results table."""
    if not results:
        print("  No results found.\n")
        return

    print(f"  {'Ticker':<8} {'Score':>5} {'Verdict':<10} {'%ATH':>6} {'SI%':>6} {'MktCap':>10} {'M2':>3} {'F':>3} {'L':>3} {'K':>3} {'N':>3} {'DQ%':>4} {'Signals'}")
    print(f"  {'------':<8} {'-----':>5} {'-------':<10} {'----':>6} {'---':>6} {'------':>10} {'--':>3} {'--':>3} {'--':>3} {'--':>3} {'--':>3} {'---':>4} {'-------'}")

    for r in results[:max_rows]:
        data = r.get("data", {})
        scores = r.get("scores", {})
        ticker = data.get("ticker", "?")
        final = scores.get("totalScore" if use_total else "finalScore", 0)
        verdict = r.get("verdict", "?")
        pct_ath = data.get("pctFromAth", 0) or 0
        si = data.get("shortFloat", 0) or 0
        mcap = data.get("marketCap", 0) or 0
        m2 = scores.get("scoreM2", 0)
        f_score = scores.get("scoreF", 0)
        l_score = scores.get("scoreL", 0)
        k_score = scores.get("scoreK", 0)
        n_score = scores.get("scoreN", 0)
        dq = data.get("dataQuality", 0) or 0

        # Signal flags
        signals = []
        if m2 >= 1: signals.append("M2")
        if f_score >= 1: signals.append("F")
        if l_score >= 1: signals.append("L")
        if k_score >= 1: signals.append("K")
        if n_score >= 1: signals.append("N")
        if data.get("obvDivergent"): signals.append("OBV")
        if data.get("vpDivergenceBullish"): signals.append("VP")

        mcap_str = f"${mcap/1e9:.1f}B" if mcap >= 1e9 else f"${mcap/1e6:.0f}M" if mcap >= 1e6 else "N/A"

        print(f"  {ticker:<8} {final:>5.0f} {verdict:<10} {pct_ath:>5.0f}% {si:>5.1f}% {mcap_str:>10} {m2:>3} {f_score:>3} {l_score:>3} {k_score:>3} {n_score:>3} {dq:>3.0f}% {','.join(signals)}")

    if len(results) > max_rows:
        print(f"  ... and {len(results) - max_rows} more")
    print()


def print_vcp_results(results: list[dict], max_rows: int = 30):
    """Print VCP results table."""
    if not results:
        print("  No results found.\n")
        return

    print(f"  {'Ticker':<8} {'Score':>5} {'Phase':<18} {'ATR%':>6} {'RS':>5} {'$Vol':>10} {'52wH%':>6}")
    print(f"  {'------':<8} {'-----':>5} {'-----':<18} {'----':>6} {'--':>5} {'----':>10} {'-----':>6}")

    for r in results[:max_rows]:
        data = r.get("data", {})
        scores = r.get("scores", {})
        ticker = data.get("ticker", "?")
        total = scores.get("totalScore", 0)
        phase = r.get("phase", "?")
        atr_pct = data.get("atrPct", 0) or 0
        rs = data.get("relativeStrength", 0) or 0
        dvol = data.get("dollarVolume50d", 0) or 0
        dist = data.get("distFrom52wHigh", 0) or 0

        dvol_str = f"${dvol/1e6:.0f}M" if dvol >= 1e6 else f"${dvol/1e3:.0f}K"

        print(f"  {ticker:<8} {total:>5.0f} {phase:<18} {atr_pct:>5.1f}% {rs:>5.1f} {dvol_str:>10} {dist:>5.1f}%")

    if len(results) > max_rows:
        print(f"  ... and {len(results) - max_rows} more")
    print()


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Run PreRun preset scanners")
    parser.add_argument("--preset", type=str, help="Run specific preset only")
    parser.add_argument("--sector", type=str, default="All", help="Sector filter")
    args = parser.parse_args()

    print("=" * 80)
    print("QuantRadar Preset Runner")
    print(f"Universe: {len(ALL_TICKERS)} tickers | API: {API_BASE}")
    print("=" * 80)

    # Run scans (one for standard mode, one for VCP if needed)
    presets_to_run = PRESETS
    if args.preset:
        matches = {k: v for k, v in PRESETS.items() if args.preset.lower() in k.lower()}
        if not matches:
            print(f"No preset matching '{args.preset}'. Available: {', '.join(PRESETS.keys())}")
            sys.exit(1)
        presets_to_run = matches

    need_standard = any(p.get("viewMode") != "vcp" for p in presets_to_run.values())
    need_vcp = any(p.get("viewMode") == "vcp" for p in presets_to_run.values())

    standard_results: list[dict] = []
    vcp_results: list[dict] = []

    if need_standard:
        print("\n[Standard Scan] Scanning full universe...")
        standard_results = run_full_scan("standard")

    if need_vcp:
        print("\n[VCP Scan] Scanning full universe...")
        vcp_results = run_full_scan("vcp")

    # Apply each preset's filters
    print("\n" + "=" * 80)
    print("PRESET RESULTS")
    print("=" * 80)

    for name, preset in presets_to_run.items():
        view_mode = preset.get("viewMode", "standard")
        raw = vcp_results if view_mode == "vcp" else standard_results

        filtered = apply_preset_filters(raw, preset)

        print(f"\n{'=' * 60}")
        print(f"  {name} ({len(filtered)} results)")
        print(f"  {preset['desc']}")
        print(f"{'=' * 60}")

        if view_mode == "vcp":
            print_vcp_results(filtered)
        else:
            print_standard_results(filtered, use_total=preset.get("skipGate1", False))

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    for name, preset in presets_to_run.items():
        view_mode = preset.get("viewMode", "standard")
        raw = vcp_results if view_mode == "vcp" else standard_results
        filtered = apply_preset_filters(raw, preset)
        print(f"  {name:<25} {len(filtered):>4} results")
    print()


if __name__ == "__main__":
    main()
