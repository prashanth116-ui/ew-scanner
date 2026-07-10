"""Generate a PDF of the Pre-Run Scanner Runner-Finding Playbook."""

from fpdf import FPDF


class RunnerPDF(FPDF):
    def __init__(self):
        super().__init__("P", "mm", "Letter")
        self.set_auto_page_break(auto=True, margin=20)

    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(120, 120, 120)
            self.cell(0, 5, "Pre-Run Scanner Playbook  |  EW-Scanner", align="R")
            self.ln(8)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def title_page(self):
        self.add_page()
        self.ln(50)
        self.set_font("Helvetica", "B", 28)
        self.set_text_color(20, 60, 120)
        self.cell(0, 14, "Pre-Run Scanner", align="C", new_x="LMARGIN", new_y="NEXT")
        self.cell(0, 14, "Playbook", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(8)
        self.set_font("Helvetica", "I", 16)
        self.set_text_color(60, 60, 60)
        self.cell(0, 10, "Finding Runners Before They Move", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(20)
        self.set_font("Helvetica", "", 11)
        self.set_text_color(100, 100, 100)
        self.cell(0, 7, "EW-Scanner  /  QuantRadar Platform", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(35)

        # Overview box
        self.set_fill_color(240, 245, 250)
        self.set_draw_color(20, 60, 120)
        x = 25
        w = self.w - 50
        self.rect(x, self.get_y(), w, 62, style="FD")
        self.set_x(x + 5)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(20, 60, 120)
        self.cell(w - 10, 8, "The Scanner Funnel", new_x="LMARGIN", new_y="NEXT")
        self.set_x(x + 5)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(50, 50, 50)
        lines = [
            "9 scanners run nightly on ~615 stocks. 5 are counted for confluence.",
            "Each step narrows your universe so you spend time only on the",
            "highest-conviction early setups. Follow in order.",
            "",
            "Step 1: Nightly Summary (Telegram)  -- Who has multi-scanner agreement?",
            "Step 2: Preset Daily  (/prerun/preset-daily)  -- What kind of setup?",
            "Step 3: Inflection  (/prerun/inflection-daily)  -- Where in the cycle?",
            "Step 4: Transition  (/prerun/transition-daily)  -- Structure confirmed?",
            "Step 5: VCP + Institutional  -- Pattern tight? Institutions buying?",
        ]
        for line in lines:
            self.set_x(x + 5)
            self.cell(w - 10, 5.5, line, new_x="LMARGIN", new_y="NEXT")

    def step_heading(self, number, title, question, route):
        self.ln(3)
        self.set_fill_color(20, 60, 120)
        bar_w = self.w - self.l_margin - self.r_margin
        self.rect(self.l_margin, self.get_y(), bar_w, 10, style="F")
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(255, 255, 255)
        self.set_x(self.l_margin + 3)
        self.cell(0, 10, f"Step {number}: {title}", new_x="LMARGIN", new_y="NEXT")
        self.ln(2)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(20, 60, 120)
        self.cell(0, 6, f"Question: {question}", new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "I", 9)
        self.set_text_color(80, 80, 80)
        self.cell(0, 6, f"Navigate to {route}", new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def appendix_heading(self, title):
        self.ln(3)
        self.set_fill_color(60, 60, 60)
        bar_w = self.w - self.l_margin - self.r_margin
        self.rect(self.l_margin, self.get_y(), bar_w, 10, style="F")
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(255, 255, 255)
        self.set_x(self.l_margin + 3)
        self.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

    def sub_heading(self, title):
        self.ln(3)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(20, 60, 120)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(1)

    def body_text(self, text):
        self.set_font("Helvetica", "", 9)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5, text)
        self.ln(1)

    def bullet(self, text, indent=10):
        self.set_font("Helvetica", "", 9)
        self.set_text_color(40, 40, 40)
        x = self.l_margin + indent
        self.set_x(x)
        self.set_font("Helvetica", "B", 9)
        self.cell(5, 5, "-")
        self.set_font("Helvetica", "", 9)
        w = self.w - self.l_margin - indent - 5 - self.r_margin
        self.multi_cell(w, 5, text)

    def bold_bullet(self, label, text, indent=10):
        self.set_text_color(40, 40, 40)
        x = self.l_margin + indent
        self.set_x(x)
        self.set_font("Helvetica", "B", 9)
        self.cell(5, 5, "- ")
        bw = self.get_string_width(label + " ")
        self.cell(bw, 5, label + " ")
        self.set_font("Helvetica", "", 9)
        w = self.w - self.l_margin - indent - 5 - bw - self.r_margin
        self.multi_cell(max(w, 20), 5, text)

    def callout_box(self, label, text, color="red"):
        self.ln(3)
        if color == "red":
            self.set_fill_color(255, 235, 235)
            self.set_draw_color(200, 50, 50)
            label_color = (180, 30, 30)
        elif color == "green":
            self.set_fill_color(235, 250, 235)
            self.set_draw_color(50, 150, 50)
            label_color = (30, 120, 30)
        elif color == "blue":
            self.set_fill_color(235, 240, 255)
            self.set_draw_color(50, 80, 180)
            label_color = (30, 60, 150)
        else:
            self.set_fill_color(255, 245, 230)
            self.set_draw_color(200, 130, 30)
            label_color = (180, 110, 20)

        x = self.l_margin
        w = self.w - self.l_margin - self.r_margin
        self.set_font("Helvetica", "", 9)
        text_w = w - 10
        n_lines = max(1, len(text) * self.get_string_width("x") / text_w + 1)
        box_h = max(18, 8 + n_lines * 5)

        if self.get_y() + box_h > self.h - 25:
            self.add_page()

        self.rect(x, self.get_y(), w, box_h, style="FD")
        self.set_x(x + 5)
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*label_color)
        self.cell(0, 7, label, new_x="LMARGIN", new_y="NEXT")
        self.set_x(x + 5)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(50, 50, 50)
        self.multi_cell(text_w, 5, text)
        self.ln(2)

    def table(self, headers, rows, col_widths=None):
        if col_widths is None:
            usable = self.w - self.l_margin - self.r_margin
            col_widths = [usable / len(headers)] * len(headers)

        row_height = 6
        needed = row_height * (len(rows) + 1) + 5
        if self.get_y() + needed > self.h - 25:
            self.add_page()

        self.set_font("Helvetica", "B", 8)
        self.set_fill_color(30, 70, 130)
        self.set_text_color(255, 255, 255)
        for i, h in enumerate(headers):
            self.cell(col_widths[i], row_height, h, border=1, fill=True, align="C")
        self.ln()

        self.set_font("Helvetica", "", 8)
        self.set_text_color(40, 40, 40)
        for ri, row in enumerate(rows):
            fill = ri % 2 == 0
            if fill:
                self.set_fill_color(245, 248, 252)
            else:
                self.set_fill_color(255, 255, 255)
            for i, cell_val in enumerate(row):
                self.cell(col_widths[i], row_height, str(cell_val), border=1, fill=True)
            self.ln()
        self.ln(2)

    def code_block(self, text):
        self.set_font("Courier", "", 8)
        self.set_text_color(30, 30, 30)
        self.set_fill_color(240, 240, 240)
        self.set_draw_color(200, 200, 200)
        x = self.l_margin + 5
        lines = text.strip().split("\n")
        h = len(lines) * 4.5 + 6
        if self.get_y() + h > self.h - 25:
            self.add_page()
        self.rect(x, self.get_y(), self.w - self.l_margin - self.r_margin - 10, h, style="FD")
        self.set_y(self.get_y() + 3)
        for line in lines:
            self.set_x(x + 3)
            self.cell(0, 4.5, line, new_x="LMARGIN", new_y="NEXT")
        self.ln(4)


def build_pdf():
    pdf = RunnerPDF()
    pdf.alias_nb_pages()
    pdf.set_margins(20, 15, 20)

    # ─── Title Page ───
    pdf.title_page()

    # ─── Table of Contents ───
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(20, 60, 120)
    pdf.cell(0, 10, "Contents", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    toc = [
        ("Step 1", "Nightly Summary", "Telegram"),
        ("Step 2", "Preset Daily", "/prerun/preset-daily"),
        ("Step 3", "Inflection Scanner", "/prerun/inflection-daily"),
        ("Step 4", "Transition Scanner", "/prerun/transition-daily"),
        ("Step 5", "VCP + Institutional", "/prerun/vcp-daily, /prerun/institutional-daily"),
        ("", "The Final Funnel", ""),
        ("", "Edge Tips & Pitfalls", ""),
        ("Appendix A", "Confluence & Scanner Map", ""),
        ("Appendix B", "Preset Qualification Criteria", ""),
        ("Appendix C", "Enrichment Filters Reference", ""),
        ("Appendix D", "Scoring Criteria (A-Q + M2)", ""),
    ]
    for level, title, route in toc:
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(20, 60, 120)
        prefix = f"{level}: " if level else ""
        pdf.cell(85, 7, f"  {prefix}{title}")
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 7, route, new_x="LMARGIN", new_y="NEXT")

    # ═══════════════════════════════════════════════════════
    # STEP 1: Nightly Summary
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.step_heading(
        "1", "Nightly Summary",
        "How many scanners agree on this stock?",
        "Telegram -- the nightly summary message arrives at 11 PM ET."
    )

    pdf.body_text(
        "The nightly summary is your entry point. It runs after all 8 scanner crons "
        "finish and computes confluence tiers across 5 independent scanners. "
        "Start here every night -- don't go directly to individual scanner pages."
    )

    pdf.sub_heading("Confluence Tiers")
    pdf.table(
        ["Tier", "Meaning", "Your Action"],
        [
            ["5/5", "All 5 scanners agree", "Top priority -- research immediately"],
            ["4/5", "4 scanners agree", "Strong candidate -- carry forward"],
            ["3/5", "3 scanners agree", "Watchlist -- needs one more confirmation"],
            ["2/5", "2 scanners agree", "Monitor only -- too early or weak"],
            ["1/5", "Single scanner", "Noise -- ignore unless 4h-ONLY"],
        ],
        [15, 60, 95],
    )

    pdf.sub_heading("5 Scanners Counted for Confluence")
    pdf.table(
        ["Label", "Scanner", "What It Detects"],
        [
            ["Setup", "PreRun Daily", "6-preset breakout/setup patterns (score > 0 required)"],
            ["Inflect", "Inflection", "Accumulation cycle stage + trade read (STARTER/ADD_ON only)"],
            ["VCP", "VCP", "Volatility contraction patterns before breakout"],
            ["Inst", "Institutional", "Institutional flow quality + momentum"],
            ["Rot", "PreRunner", "Sector rotation leaders + turnaround candidates"],
        ],
        [18, 30, 122],
    )

    pdf.sub_heading("Badge-Only (Not Counted)")
    pdf.table(
        ["Label", "Why Excluded", "Still Useful For"],
        [
            ["QFE", "100% derived from PreRun data", "Quality rating (A+ to D) at a glance"],
            ["Setup4h", "Same scoring, different timeframe", "Early detection 1-2 days before daily"],
            ["Trans", "Trial scanner", "Market structure confirmation"],
            ["INF WATCH", "Low conviction signal", "Very early accumulation stage"],
        ],
        [24, 60, 86],
    )

    pdf.callout_box(
        "KEY SECTIONS TO CHECK",
        "1) 5/5 and 4/5 tiers -- your primary candidates, sorted by RS acceleration.  "
        "2) 'New (Multi-Scanner)' -- tickers that just appeared on 2+ scanners today (earliest signals).  "
        "3) '4h-ONLY' -- tickers on 4h scanner but NOT daily (pre-breakout detections).  "
        "4) 'Dropped' -- yesterday's multi-scanner tickers missing today (may still be valid).",
        "blue",
    )

    pdf.callout_box(
        "FILTER RULE",
        "Only carry forward tickers with 3/5 or higher confluence into Step 2. "
        "Exception: 4h-ONLY tickers with score >= 18 are worth tracking even at 1/5.",
        "green",
    )

    # ═══════════════════════════════════════════════════════
    # STEP 2: Preset Daily
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.step_heading(
        "2", "Preset Daily",
        "What kind of setup is this?",
        "/prerun/preset-daily -- check which presets your candidates qualify for."
    )

    pdf.body_text(
        "The preset tells you what type of breakout setup the stock is building. "
        "Different presets catch different patterns. For finding runners early, "
        "prioritize the presets that detect accumulation before the move."
    )

    pdf.sub_heading("Preset Priority for Early Runners")
    pdf.table(
        ["Priority", "Preset", "Detects", "Why It Matters"],
        [
            ["1st", "Early Mover", "25%+ from ATH, EMA + HL + vol", "Classic early breakout pattern"],
            ["2nd", "Stealth", "OBV divergence / VP bullish", "Quiet accumulation before anyone notices"],
            ["3rd", "Early+", "Range coil + volume divergence", "Tightest pre-breakout compression"],
            ["4th", "Pullback", "Reversal from pullback", "Already turning, 2/3 confirmation met"],
            ["5th", "Leading", "Sector leader + momentum", "Continuation play, not early entry"],
            ["6th", "SNDK", "Deep short + high SI%", "Different thesis (short squeeze)"],
        ],
        [18, 26, 55, 71],
    )

    pdf.sub_heading("Filters to Apply")
    pdf.bold_bullet("Scanner Mode:", "Start with Daily, then toggle to 4h for earlier signals")
    pdf.bold_bullet("Min Score:", "Set to 18+ to cut noise (verdicts: PRIORITY >= 19 + earnings, KEEP >= 19)")
    pdf.bold_bullet("Multi-Preset Overlap:", "Check the overlap section -- tickers on 3+ presets are strongest")
    pdf.bold_bullet("Sort by Score:", "Then check streak -- rising streak (3d+) with positive delta = strengthening")

    pdf.sub_heading("Verdict System")
    pdf.table(
        ["Verdict", "Criteria", "Action"],
        [
            ["PRIORITY", "finalScore >= 19 + earnings <= 14d", "Immediate research -- catalyst imminent"],
            ["KEEP", "finalScore >= 19", "Strong setup -- carry forward"],
            ["WATCH", "finalScore >= 14", "Developing -- monitor for improvement"],
            ["DISCARD", "Below thresholds", "Skip -- not ready"],
        ],
        [25, 65, 80],
    )

    pdf.callout_box(
        "NARROW DOWN",
        "Keep only PRIORITY/KEEP verdicts that appear on Early Mover, Stealth, or Early+ presets. "
        "These are the 'getting in early' presets. Leading and Pullback are valid but catch "
        "moves later in the cycle.",
        "green",
    )

    # ═══════════════════════════════════════════════════════
    # STEP 3: Inflection Scanner
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.step_heading(
        "3", "Inflection Scanner",
        "Where in the accumulation cycle is this stock?",
        "/prerun/inflection-daily -- your timing layer for when to enter."
    )

    pdf.body_text(
        "The Inflection scanner classifies WHERE in the accumulation cycle a stock is. "
        "This is different from PreRun (which scores HOW STRONG the setup is). "
        "Use Inflection to time your entry -- the stage tells you if you're early or late."
    )

    pdf.sub_heading("Filter Sequence")
    pdf.bold_bullet("Trade Read = Starter:", "These are actionable entry candidates (Add On = already running)")
    pdf.bold_bullet("Stage = Inflection or Early Accum.:", "Earliest stages -- Expansion means the move started")
    pdf.bold_bullet("Min Score = 40+:", "Focus on quality signals")

    pdf.sub_heading("Enrichment Filters (Sector Rotation Cross-Reference)")
    pdf.body_text(
        "These filters overlay sector rotation data onto scanner results. Use them "
        "to confirm sector tailwinds behind your candidates."
    )
    pdf.table(
        ["Filter", "Best Setting", "Why"],
        [
            ["RRG Quadrant", "IMPROVING", "Sector accelerating but hasn't peaked"],
            ["Phase", "P2 (Turnaround)", "RS inflection point -- early"],
            ["RS Accel", "Strong or Moderate", "Relative strength actively improving"],
            ["Volume", "High or Above Avg", "Institutional participation confirming"],
        ],
        [30, 40, 100],
    )

    pdf.sub_heading("Sub-Score Reading Guide")
    pdf.table(
        ["Component", "Abbrev", "What High Score Means"],
        [
            ["Seller Exhaustion", "SE", "Down-volume declining, sellers drying up"],
            ["Volume Confirmation", "VC", "Up-volume expanding, buyers stepping in"],
            ["Breakout Evidence", "BE", "Price structure forming breakout pattern"],
            ["Relative Strength", "RS", "Outperforming peers and SPY"],
            ["Liquidity Accum.", "LA", "Smart money building positions quietly"],
            ["Inflection Point", "IP", "Technical inflection confirmed"],
        ],
        [35, 18, 117],
    )

    pdf.callout_box(
        "IDEAL INFLECTION CANDIDATE",
        "Trade Read = STARTER + Stage = INFLECTION or EARLY ACCUM + Score >= 40 + "
        "RRG Quadrant = IMPROVING or LEADING + RS Accel = Strong/Moderate + "
        "high SE score (sellers exhausted) + rising LA score (accumulation happening).",
        "blue",
    )

    pdf.sub_heading("Stages Explained (Best to Worst for Early Entry)")
    pdf.table(
        ["Stage", "Meaning", "Timing"],
        [
            ["Seller Exhaustion", "Selling pressure fading", "Very early -- patience needed"],
            ["Early Accumulation", "Accumulation starting", "Early -- ideal entry zone"],
            ["Inflection", "Cycle turning point", "Prime -- setup forming now"],
            ["Expansion", "Breakout underway", "Late -- move already started"],
        ],
        [35, 60, 75],
    )

    pdf.callout_box(
        "NARROW DOWN",
        "Keep Starter + (Inflection or Early Accum) stage + IMPROVING/LEADING quadrant + "
        "positive RS acceleration. Typically narrows from 10-15 candidates to 5-8.",
        "green",
    )

    # ═══════════════════════════════════════════════════════
    # STEP 4: Transition Scanner
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.step_heading(
        "4", "Transition Scanner",
        "Is the market structure confirmed?",
        "/prerun/transition-daily -- swing pivot analysis for structural confirmation."
    )

    pdf.body_text(
        "The Transition scanner uses swing pivots, Change of Character (ChoCH), and "
        "Break of Structure (BOS) to confirm that the market structure has shifted from "
        "bearish to bullish. This is your structural confirmation layer."
    )

    pdf.sub_heading("The High Conviction Filter (Most Important)")
    pdf.callout_box(
        "HIGH CONVICTION TOGGLE",
        "Click the 'High Conviction' button. This automatically filters to tickers that are: "
        "1) On Transition with alert = ARMED, READY, or TRIGGERED, AND "
        "2) On Inflection with trade read = STARTER or ADD_ON, AND "
        "3) In an IMPROVING or LEADING sector quadrant. "
        "This is the tightest cross-scanner filter in the system. If it yields results, "
        "those are your top candidates.",
        "blue",
    )

    pdf.sub_heading("Alert States (What They Mean for Timing)")
    pdf.table(
        ["Alert State", "Meaning", "Your Action"],
        [
            ["TRIGGERED", "Breakout confirmed with volume", "Execute now -- entry is live"],
            ["READY", "Within 2 ATR of trigger level", "Set alerts -- breakout imminent"],
            ["ARMED", "Structure set, price hasn't reached trigger", "Watchlist -- be patient"],
            ["WATCH", "Early structural signals forming", "Monitor -- too early to act"],
        ],
        [25, 65, 80],
    )

    pdf.sub_heading("Market Structure States (Bullish to Bearish)")
    pdf.table(
        ["State", "Label", "What It Means"],
        [
            ["SUSTAINED_MARKUP", "Markup", "Trending higher -- ride the trend"],
            ["EARLY_EXPANSION", "Early Exp.", "Breakout just happened -- fresh entry"],
            ["BULLISH_BOS", "BOS", "Break of structure confirmed -- strong"],
            ["COMPRESSION", "Compress", "Range tightening before expansion"],
            ["HIGHER_LOW_FORMATION", "HL Form.", "Higher low forming after ChoCH"],
            ["BULLISH_CHOCH", "ChoCH", "Change of character -- trend reversing"],
            ["DEMAND_INCREASING", "Demand+", "Buying pressure building"],
            ["ACCUMULATION", "Accum.", "Range-bound, OBV diverging"],
            ["SELLING_EXHAUSTION", "Seller Exh.", "Down-volume declining"],
        ],
        [40, 24, 106],
    )

    pdf.sub_heading("Manual Filter Sequence (If High Conviction Is Empty)")
    pdf.bold_bullet("Alert State:", "TRIGGERED or READY -- price is at or near breakout trigger")
    pdf.bold_bullet("State:", "BULLISH_BOS or EARLY_EXPANSION -- structure confirmed")
    pdf.bold_bullet("Enrichment Quadrant:", "IMPROVING -- sector tailwind")
    pdf.bold_bullet("Enrichment RS Accel:", "Strong or Moderate -- relative strength improving")
    pdf.ln(2)
    pdf.body_text(
        "Look for the INF badge in the Flags column -- this means the ticker is also on "
        "the Inflection scanner. Hover to see the inflection trade read and score. "
        "Similarly, the INST badge means it's on the Institutional scanner."
    )

    pdf.callout_box(
        "NARROW DOWN",
        "TRIGGERED/READY with INF badge (dual-scanner confirmation) + IMPROVING/LEADING sector. "
        "Typically narrows from 5-8 candidates to 2-4.",
        "green",
    )

    # ═══════════════════════════════════════════════════════
    # STEP 5: VCP + Institutional
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.step_heading(
        "5", "VCP + Institutional (Confirmation)",
        "Is the pattern tight? Are institutions buying?",
        "/prerun/vcp-daily and /prerun/institutional-daily -- final confirmation layer."
    )

    pdf.body_text(
        "These scanners confirm but don't discover. A candidate from Steps 2-4 that also "
        "shows a VCP pattern or institutional flow is the highest-quality setup."
    )

    pdf.sub_heading("VCP Scanner")
    pdf.table(
        ["Filter", "Setting", "Why"],
        [
            ["Phase", "Focus List", "Highest conviction VCP patterns"],
            ["Sort by", "Compression Score", "Tightest patterns = lowest entry risk"],
            ["Look for", "Your Step 2-4 candidates", "VCP confirms tight entry with defined risk"],
        ],
        [30, 40, 100],
    )

    pdf.body_text(
        "A VCP pattern means volatility is contracting -- each pullback is shallower than "
        "the last. When a stock from your candidate list also shows a VCP, the entry risk "
        "is well-defined (stop below the last contraction low)."
    )

    pdf.sub_heading("Institutional Scanner")
    pdf.table(
        ["Filter", "Setting", "Why"],
        [
            ["Tier", "Shortlist", "Highest institutional conviction"],
            ["Classification", "ACCUM_SETUP or BREAKOUT_SETUP", "Institutions building/breaking out"],
            ["RS Accel SPY", "Positive and rising", "Institutional money actively flowing in"],
        ],
        [30, 55, 85],
    )

    pdf.sub_heading("Classification Quick Reference")
    pdf.table(
        ["Classification", "Signal", "Action"],
        [
            ["ACCUMULATION_SETUP", "Institutions building position", "Strong entry signal"],
            ["BREAKOUT_SETUP", "Institutional breakout imminent", "Entry signal -- watch volume"],
            ["MOMENTUM_LEADER", "Already leading with flow", "Continuation -- add on pullback"],
            ["STRONG_LEADER", "Dominant institutional presence", "Core hold"],
            ["AVOID", "Institutional distribution", "Skip -- smart money selling"],
        ],
        [40, 50, 80],
    )

    pdf.callout_box(
        "FINAL CANDIDATE LIST",
        "Your 2-4 candidates from Step 4 that also appear on VCP Focus List or Institutional "
        "Shortlist are your highest-conviction trades. These have: multi-scanner confluence, "
        "early-stage setup, structural confirmation, sector tailwind, and institutional backing.",
        "green",
    )

    # ═══════════════════════════════════════════════════════
    # THE FINAL FUNNEL
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(20, 60, 120)
    pdf.cell(0, 10, "The Final Funnel", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    pdf.table(
        ["Step", "Scanner", "Question", "Typical Count"],
        [
            ["1", "Nightly Summary", "How many scanners agree?", "~615 -> 20-40 (3/5+)"],
            ["2", "Preset Daily", "What kind of setup?", "20-40 -> 10-15"],
            ["3", "Inflection", "Where in the cycle?", "10-15 -> 5-8"],
            ["4", "Transition", "Structure confirmed?", "5-8 -> 2-4"],
            ["5", "VCP + Institutional", "Pattern tight? Inst buying?", "2-4 -> 1-3"],
        ],
        [14, 32, 58, 66],
    )

    pdf.sub_heading("Visual Flow")
    pdf.code_block(
        "~615 tickers scanned nightly\n"
        "        |\n"
        "  Step 1: Confluence >= 3/5\n"
        "        |  (~20-40 remain)\n"
        "        v\n"
        "  Step 2: Early Mover / Stealth / Early+ preset, score >= 18\n"
        "        |  (~10-15 remain)\n"
        "        v\n"
        "  Step 3: Inflection STARTER + early stage + IMPROVING sector\n"
        "        |  (~5-8 remain)\n"
        "        v\n"
        "  Step 4: Transition TRIGGERED/READY + High Conviction toggle\n"
        "        |  (~2-4 remain)\n"
        "        v\n"
        "  Step 5: VCP Focus + Institutional Shortlist confirmation\n"
        "        |  (~1-3 remain)\n"
        "        v\n"
        "  FINAL WATCHLIST: Highest-conviction early runners"
    )

    # ═══════════════════════════════════════════════════════
    # EDGE TIPS & PITFALLS
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(20, 60, 120)
    pdf.cell(0, 10, "Edge Tips & Pitfalls", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    pdf.sub_heading("6 Tips for Getting In Early")

    pdf.bold_bullet("4h scanner as a leading indicator:",
                    "Toggle to 4h mode on the preset page. The 4h scanner often catches "
                    "setups 1-2 days before the daily confirms. A stock on 4h Early Mover "
                    "today may show up on daily Early Mover tomorrow.")

    pdf.bold_bullet("Score delta over absolute score:",
                    "A stock with score 16 and delta +4 (improving fast) is often better than "
                    "score 22 and delta -2 (deteriorating). Sort by delta to find setups that "
                    "are actively strengthening.")

    pdf.bold_bullet("Streak as a timing signal:",
                    "Streak = 1 (NEW today) = scanner just picked it up. "
                    "Streak = 3-5 with rising delta = sweet spot. "
                    "Streak > 7 with flat/negative delta = setup may be getting stale.")

    pdf.bold_bullet("Sector quadrant as a veto:",
                    "Even if a stock scores well on every scanner, if its sector is LAGGING "
                    "or WEAKENING, the sector headwind makes the trade harder. Use the enrichment "
                    "quadrant filter to exclude LAGGING/WEAKENING.")

    pdf.bold_bullet("Watch the 'Dropped' sections:",
                    "A stock that drops off Inflection but stays on Transition may be "
                    "transitioning from accumulation into markup -- that's actually bullish. "
                    "Don't auto-dismiss dropped tickers.")

    pdf.bold_bullet("Cross-page badge stacking:",
                    "On the Inflection page, tickers with BOTH a TRANS badge AND an INST badge "
                    "have triple-scanner overlap without even checking presets. These are the "
                    "highest-conviction cross-references.")

    pdf.sub_heading("5 Pitfalls to Avoid")

    pdf.bold_bullet("Chasing high scores:",
                    "A score of 30 in Expansion stage is worse than a score of 20 in Early "
                    "Accumulation. The stage matters more than the number for early entry.")

    pdf.bold_bullet("Ignoring sector context:",
                    "A perfect setup in a LAGGING sector will underperform a decent setup in "
                    "an IMPROVING sector. Always check the enrichment quadrant filter.")

    pdf.bold_bullet("Overweighting single scanners:",
                    "One scanner at 5/5 confidence is less reliable than three scanners at "
                    "3/5 each. Confluence is the edge, not any single scanner's conviction.")

    pdf.bold_bullet("Skipping Step 1:",
                    "Going directly to individual scanner pages means you miss the confluence "
                    "ranking. The nightly summary sorts by RS acceleration within tiers -- "
                    "this ordering is the edge.")

    pdf.bold_bullet("Acting on WATCH signals:",
                    "WATCH trade reads and ARMED alert states are monitoring states, not "
                    "action states. Wait for STARTER / TRIGGERED before committing capital.")

    # ═══════════════════════════════════════════════════════
    # APPENDIX A: Confluence & Scanner Map
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.appendix_heading("Appendix A: Confluence & Scanner Map")

    pdf.sub_heading("Scanner Architecture (9 Engines)")
    pdf.body_text(
        "9 scanning engines run nightly. 5 are counted for confluence, 4 are badge-only. "
        "All share a universal quality gate: price >= $15, mcap >= $8B, "
        "dollarVol >= $100M/day, dataQuality >= 40%."
    )

    pdf.table(
        ["Scanner", "Label", "Confluence?", "Unique Value"],
        [
            ["PreRun Setup", "Setup", "Yes", "Core breakout patterns, 6 presets, 18 criteria"],
            ["Inflection", "Inflect", "Yes", "Accumulation cycle stage + trade read"],
            ["VCP", "VCP", "Yes", "Volatility contraction, entry/stop/targets"],
            ["Institutional", "Inst", "Yes", "Mega-cap flow, 12 classifications"],
            ["PreRunner", "Rot", "Yes", "Rotation leaders + turnarounds"],
            ["QFE", "QFE", "No (badge)", "Quality rating A+ to D (derived from PreRun)"],
            ["Setup 4h", "Setup4h", "No (badge)", "Early detection, 1-2 days before daily"],
            ["Transition", "Trans", "No (badge)", "Market structure (ChoCH, BOS, pivots)"],
            ["Catalyst", "n/a", "No (separate)", "Short-term event-driven spikes"],
        ],
        [28, 18, 28, 96],
    )

    pdf.sub_heading("Nightly Summary Sorting Logic")
    pdf.body_text(
        "Within each confluence tier, stocks are sorted by RS acceleration (highest first), "
        "then by max score as a tiebreaker. This means the fastest-improving stocks appear "
        "at the top of each tier -- exactly what you want for early runner detection."
    )
    pdf.table(
        ["RS Accel Source", "Priority", "Field"],
        [
            ["QFE", "1st", "rs_5d_spy - rs_20d_spy (short-term RS change)"],
            ["PreRunner", "2nd", "rs_acceleration"],
            ["Institutional", "3rd", "rs_accel_spy"],
        ],
        [30, 18, 122],
    )

    # ═══════════════════════════════════════════════════════
    # APPENDIX B: Preset Qualification Criteria
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.appendix_heading("Appendix B: Preset Qualification Criteria")

    pdf.sub_heading("Universal Quality Gate (Applied Before All Presets)")
    pdf.table(
        ["Check", "Threshold", "Field"],
        [
            ["Price", ">= $15", "currentPrice"],
            ["Market Cap", ">= $8B", "marketCap"],
            ["Dollar Volume", ">= $100M/day", "vcpAvgDollarVolume (50d avg)"],
            ["Data Quality", ">= 40%", "dataQuality (% of API calls succeeded)"],
        ],
        [28, 40, 102],
    )

    pdf.sub_heading("Gate System (3 Gates)")
    pdf.table(
        ["Gate", "Condition", "Purpose"],
        [
            ["G1", "pctFromAth >= 20% (10% for 4h)", "Requires meaningful pullback from highs"],
            ["G2", "No existential risk flag", "Excludes fundamentally impaired stocks"],
            ["G3", "Price > 92% of SMA20", "Base forming, not in free-fall"],
        ],
        [15, 60, 95],
    )

    pdf.sub_heading("6 Preset Qualification Rules")
    pdf.table(
        ["Preset", "Score Gate", "Special Criteria"],
        [
            ["SNDK", "finalScore >= 18", "pctFromAth >= 40% AND shortFloat >= 15%"],
            ["Early Mover", "finalScore >= 14", "pctFromAth >= 25% AND M2 >= 1, L >= 1, F >= 1"],
            ["Pullback", "finalScore >= 15", "pctFromAth <= 40% AND 2/3 of (M2, F, L) >= 1"],
            ["Leading", "finalScore >= 15", "M >= 1, J >= 1, quadrant LEADING or IMPROVING"],
            ["Stealth", "finalScore >= 11", "M2 >= 1 AND (OBV divergent OR VP bullish)"],
            ["Early+", "finalScore >= 10", "M2 >= 1, N >= 1, (OBV divergent OR VP bullish)"],
        ],
        [28, 35, 107],
    )

    pdf.sub_heading("Key Scoring Criteria Explained")
    pdf.table(
        ["Criteria", "Code", "What It Measures"],
        [
            ["EMA Timing", "M2", "Recent EMA cross or bullish alignment"],
            ["Higher Lows", "L", "3+ swing lows higher = 2; 2+ = 1"],
            ["Volume Accum.", "F", "Up/down ratio >= 1.3 + float turnover"],
            ["EMA Reclaim", "M", "Above 21+50 EMA + recent crossover"],
            ["Relative Strength", "J", "RS vs sector: >+5% = 2, +/-5% = 1"],
            ["Range Coil", "N", "Tight closes near top + ATR contracting"],
            ["OBV Divergence", "P", "Price flat/down but OBV rising"],
            ["Volume Profile", "Q", "VP POC below price = bullish"],
        ],
        [30, 14, 126],
    )

    # ═══════════════════════════════════════════════════════
    # APPENDIX C: Enrichment Filters Reference
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.appendix_heading("Appendix C: Enrichment Filters Reference")

    pdf.body_text(
        "Enrichment filters overlay sector rotation data onto scanner results. Available on "
        "the Inflection and Transition pages. Data comes from the /api/sector-rotation "
        "endpoint (enrichedStocks.passed array)."
    )

    pdf.sub_heading("RRG Quadrant Filter")
    pdf.table(
        ["Value", "Meaning", "Best For"],
        [
            ["LEADING", "Outperforming + accelerating", "Continuation trades"],
            ["IMPROVING", "Underperforming + accelerating", "Early entry (sweet spot)"],
            ["WEAKENING", "Outperforming + decelerating", "Tighten stops, no new entries"],
            ["LAGGING", "Underperforming + decelerating", "Avoid -- dead money"],
        ],
        [28, 55, 87],
    )

    pdf.sub_heading("Phase Filter")
    pdf.table(
        ["Phase", "Criteria", "Timing"],
        [
            ["P1 Basing", "Below 50-SMA + positive RS accel", "Very early -- building a base"],
            ["P2 Turnaround", "Near 50-SMA + RS accel > 0.5 + vol >= 1.2x", "Inflection -- ideal entry"],
            ["P3 Trending", "Above 50-SMA + > 3% from SMA + vol >= 0.7x", "Uptrend confirmed"],
            ["P4 Exhausting", "Above 50-SMA + RS accel < -2", "Topping -- exit"],
        ],
        [25, 70, 75],
    )

    pdf.sub_heading("RS Acceleration Filter")
    pdf.table(
        ["Bucket", "Range", "Interpretation"],
        [
            ["Strong", ">= 4.5", "Rapidly outpacing SPY -- highest conviction"],
            ["Moderate", "1.5 to 4.5", "Outpacing SPY -- good signal"],
            ["Neutral", "-1.5 to 1.5", "Tracking SPY -- no edge"],
            ["Decelerating", "< -1.5", "Falling behind SPY -- avoid"],
        ],
        [28, 28, 114],
    )

    pdf.sub_heading("Volume Filter")
    pdf.table(
        ["Bucket", "Range", "Interpretation"],
        [
            ["High", ">= 1.5x", "Strong institutional participation"],
            ["Above Avg", "1.2x to 1.5x", "Confirming accumulation"],
            ["Normal", "1.0x to 1.2x", "Neutral volume"],
            ["Low", "< 1.0x", "No conviction -- distribution possible"],
        ],
        [28, 28, 114],
    )

    pdf.sub_heading("Enriched Count Badge")
    pdf.body_text(
        "The 'Enriched: X/Y' badge shows how many scanner results have enrichment data. "
        "Stocks without enrichment data are hidden when any non-ALL filter is active. "
        "Typically ~200-400 stocks get enriched out of ~615 scanned."
    )

    # ═══════════════════════════════════════════════════════
    # APPENDIX D: Full Scoring Criteria
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.appendix_heading("Appendix D: Scoring Criteria (A-Q + M2)")

    pdf.body_text(
        "The PreRun scanner scores 18 criteria (A through Q plus M2). Each scores 0, 1, or 2 "
        "for a maximum raw score of 40. The finalScore is used for preset qualification and verdicts."
    )

    pdf.table(
        ["Code", "Name", "0 (Fail)", "1 (Pass)", "2 (Strong)"],
        [
            ["A", "ATH Distance", "< 20% from ATH", "20-40%", ">= 40%"],
            ["B", "Risk Check", "Existential risk", "Minor concerns", "Clean"],
            ["C", "Base Formation", "Price < 92% SMA20", "Forming", "Confirmed"],
            ["D", "Earnings Cat.", "No catalyst", "Distant earnings", "Earnings <= 30d"],
            ["E", "Short Interest", "Low SI", "Moderate SI", "SI >= 15%"],
            ["F", "Volume Accum.", "Ratio < 1.0", "Ratio >= 1.0", ">= 1.3 + turnover"],
            ["G", "Inst. Ownership", "< 30%", "30-60%", "> 60%"],
            ["H", "Analyst Revs.", "Negative", "Neutral", "Positive revisions"],
            ["I", "Sector Trend", "Weak sector", "Neutral", "Strong sector"],
            ["J", "Relative Str.", "> -5% vs sector", "+/- 5%", "> +5% vs sector"],
            ["K", "RSI Setup", "Overbought", "Neutral", "Oversold recovery"],
            ["L", "Higher Lows", "No pattern", "2+ swing lows", "3+ swing lows"],
            ["M", "EMA Reclaim", "Below both", "Above one EMA", "Above 21+50 + cross"],
            ["M2", "EMA Timing", "No signal", "Bullish alignment", "Recent cross/FVG"],
            ["N", "Range Coil", "No compression", "One condition", "Tight + ATR contract"],
            ["O", "Candle Struct.", "Bearish", "Neutral", "Bullish pattern"],
            ["P", "OBV Divergence", "No divergence", "Mild divergence", "Strong divergence"],
            ["Q", "Volume Profile", "VP neutral", "Mild bullish", "POC below price"],
        ],
        [10, 28, 38, 34, 38],
    )

    # ─── Output ───
    output_path = "PreRun_Scanner_Playbook.pdf"
    pdf.output(output_path)
    print(f"PDF generated: {output_path}")
    return output_path


if __name__ == "__main__":
    build_pdf()
