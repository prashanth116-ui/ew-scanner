"""Generate a PDF of the Top-Down Analysis Framework — practical playbook format."""

from fpdf import FPDF


class FrameworkPDF(FPDF):
    def __init__(self):
        super().__init__("P", "mm", "Letter")
        self.set_auto_page_break(auto=True, margin=20)

    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(120, 120, 120)
            self.cell(0, 5, "Top-Down Analysis Framework  |  EW-Scanner", align="R")
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
        self.cell(0, 14, "Top-Down Analysis", align="C", new_x="LMARGIN", new_y="NEXT")
        self.cell(0, 14, "Framework", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(8)
        self.set_font("Helvetica", "I", 16)
        self.set_text_color(60, 60, 60)
        self.cell(0, 10, "How to Spot Runners Before They Move", align="C", new_x="LMARGIN", new_y="NEXT")
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
        self.rect(x, self.get_y(), w, 55, style="FD")
        self.set_x(x + 5)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(20, 60, 120)
        self.cell(w - 10, 8, "The Funnel", new_x="LMARGIN", new_y="NEXT")
        self.set_x(x + 5)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(50, 50, 50)
        lines = [
            "The system is a funnel -- wide at the top (macro), narrow at the",
            "bottom (individual stocks). Each level narrows your focus so you only",
            "spend time on the highest-conviction setups. Follow in order.",
            "",
            "Level 1: Macro Regime  (/sectors/brief)  -- Is the environment favorable?",
            "Level 2: Sector Selection  (/sectors)  -- Which sectors are rotating in?",
            "Level 3: Rotation Confirmation  (/rotation)  -- Real rotation or noise?",
            "Level 4: Stock Selection  (/sectors/picks)  -- Which stocks will move most?",
        ]
        for line in lines:
            self.set_x(x + 5)
            self.cell(w - 10, 5.5, line, new_x="LMARGIN", new_y="NEXT")

    def level_heading(self, number, title, question, route):
        self.ln(3)
        # Blue bar
        self.set_fill_color(20, 60, 120)
        bar_w = self.w - self.l_margin - self.r_margin
        self.rect(self.l_margin, self.get_y(), bar_w, 10, style="F")
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(255, 255, 255)
        self.set_x(self.l_margin + 3)
        self.cell(0, 10, f"Level {number}: {title}", new_x="LMARGIN", new_y="NEXT")
        self.ln(2)
        # Question
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(20, 60, 120)
        self.cell(0, 6, f"Question: {question}", new_x="LMARGIN", new_y="NEXT")
        # Route
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
        """Draw a colored callout box (STOP, TIP, KILL SWITCH, etc.)."""
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
        else:  # orange/amber
            self.set_fill_color(255, 245, 230)
            self.set_draw_color(200, 130, 30)
            label_color = (180, 110, 20)

        x = self.l_margin
        w = self.w - self.l_margin - self.r_margin

        # Measure text height
        self.set_font("Helvetica", "", 9)
        # Estimate lines needed
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
        """Draw a simple table with headers and rows."""
        if col_widths is None:
            usable = self.w - self.l_margin - self.r_margin
            col_widths = [usable / len(headers)] * len(headers)

        # Check if table fits on current page
        row_height = 6
        needed = row_height * (len(rows) + 1) + 5
        if self.get_y() + needed > self.h - 25:
            self.add_page()

        # Header row
        self.set_font("Helvetica", "B", 8)
        self.set_fill_color(30, 70, 130)
        self.set_text_color(255, 255, 255)
        for i, h in enumerate(headers):
            self.cell(col_widths[i], row_height, h, border=1, fill=True, align="C")
        self.ln()

        # Data rows
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
    pdf = FrameworkPDF()
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
        ("Level 1", "Macro Regime", "/sectors/brief"),
        ("Level 2", "Sector Selection", "/sectors"),
        ("Level 3", "Rotation Confirmation", "/rotation"),
        ("Level 4", "Stock Selection", "/sectors/picks"),
        ("", "Case Study: The SEER Playbook", ""),
        ("Appendix A", "Scoring Reference", ""),
        ("Appendix B", "Quality Gates & Classification", ""),
        ("Appendix C", "Configuration & Key Files", ""),
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
    # LEVEL 1: Macro Regime
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.level_heading(
        "1", "Macro Regime",
        "Is the environment favorable?",
        "/sectors/brief -- this page gives you the macro context for everything below."
    )

    pdf.table(
        ["Breadcrumb", "Where to Look", "What You Want"],
        [
            ["Regime", "Brief > Pre-Market Pulse", "RISK_ON or MIXED (not RISK_OFF)"],
            ["VIX", "Brief > Pre-Market Pulse", "Below adaptive upper bound, stable or declining"],
            ["Trading Bias", "Brief > Trading Bias Card", "Lean Bull or Strong Bull, confidence >60%"],
            ["Posture", "Brief > Posture Banner", "AGGRESSIVE or ACTIVE (not DEFENSIVE/CASH)"],
            ["Risk Flags", "Brief > Risk Flags Panel", "Fewer than 2 high-severity flags"],
        ],
        [28, 52, 90],
    )

    pdf.callout_box(
        "STOP",
        "If regime is RISK_OFF + DEFENSIVE posture + 3+ risk flags -- no runners in this environment. "
        "Wait for conditions to improve before proceeding to Level 2.",
        "red",
    )

    pdf.sub_heading("How Regime Is Determined (Under the Hood)")
    pdf.body_text(
        "Three macro indicators from Yahoo Finance: VIX (fear gauge), 10Y yield (rates), "
        "Dollar Index (currency). VIX thresholds are adaptive -- computed from the 25th/75th "
        "percentile of the 3-month range, so a VIX of 20 means different things in calm vs "
        "volatile markets."
    )
    pdf.table(
        ["Regime", "Condition", "Favored Sectors"],
        [
            ["RISK_ON", "VIX < adaptive low, not rising", "Tech, Cons Disc, Comm Svcs"],
            ["RISK_OFF", "VIX > adaptive high or rising", "Utilities, Staples, Health Care"],
            ["INFLATIONARY", "DXY rising + yield > 4.5%", "Energy, Materials, Financials"],
            ["MIXED", "None of the above", "No directional bias"],
        ],
        [30, 60, 80],
    )

    pdf.sub_heading("Posture Determines Your Aggression")
    pdf.table(
        ["Posture", "What It Means", "Your Response"],
        [
            ["AGGRESSIVE", "RISK_ON + multiple rotations + dispersion", "Full position sizing, new entries"],
            ["SELECTIVE", "Favorable but not all-clear", "Selective entries, quality names only"],
            ["DEFENSIVE", "RISK_OFF or breadth deteriorating", "Reduce exposure, tighten stops"],
            ["CASH", "RISK_OFF + no conviction + VIX spiking", "Sidelines -- protect capital"],
        ],
        [28, 65, 77],
    )

    # ═══════════════════════════════════════════════════════
    # LEVEL 2: Sector Selection
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.level_heading(
        "2", "Sector Selection",
        "Which sectors are rotating in?",
        "/sectors (main dashboard) -- identify which sectors have institutional money flowing in."
    )

    pdf.table(
        ["Breadcrumb", "Where to Look", "What You Want"],
        [
            ["Quadrant", "Dashboard > RRG Chart", "Sectors in IMPROVING (moving toward LEADING)"],
            ["Acceleration", "Dashboard > Sector Cards", "Positive and rising -- rate of change of momentum"],
            ["Stealth Badge", "Dashboard > Sector Cards", "Green badge = accumulation before breakout"],
            ["CMF", "Dashboard > Sector Detail", "Positive (>0) = inflow, >0.10 = strong inflow"],
            ["Dispersion", "Dashboard > Summary Strip", "Rising = rotations happening, not a flat market"],
            ["Sub-sector", "Brief > Sub-Sector Div.", "Sub-sector leading parent = early signal"],
        ],
        [28, 52, 90],
    )

    pdf.callout_box(
        "TIP",
        "The ideal sector: IMPROVING quadrant + acceleration >1.0 + CMF >0 + stealth badge. "
        "This was Biotech (XBI) when it caught SEER -- the sub-sector was leading its parent "
        "(XBI > XLV) before the individual stock moved.",
        "green",
    )

    pdf.sub_heading("RRG Quadrant Rotation (clockwise cycle)")
    pdf.body_text(
        "Sectors rotate through 4 quadrants. The sweet spot for entry is IMPROVING -- the sector "
        "is underperforming but accelerating, meaning institutions are building positions before "
        "the move shows up in price."
    )
    pdf.table(
        ["Quadrant", "RS vs SPY", "Momentum", "What's Happening"],
        [
            ["LEADING", "Outperforming", "Accelerating", "Strong -- ride the trend"],
            ["WEAKENING", "Outperforming", "Decelerating", "Topping -- tighten stops"],
            ["LAGGING", "Underperforming", "Decelerating", "Avoid -- dead money"],
            ["IMPROVING", "Underperforming", "Accelerating", "Entry zone -- accumulation"],
        ],
        [28, 30, 28, 84],
    )

    pdf.sub_heading("Scoring Pipeline (31 ETFs)")
    pdf.body_text(
        "Each of the 31 ETFs gets a composite score (0-100) from 6 weighted factors:"
    )
    pdf.table(
        ["Factor", "Weight", "What It Measures"],
        [
            ["Momentum", "25%", "Weighted ROC across 63/126/189/252 day periods"],
            ["Mansfield RS", "20%", "Relative strength vs SPY (200d smoothed)"],
            ["Acceleration", "15%", "2nd derivative of momentum (speeding up or slowing)"],
            ["CMF (Chaikin)", "15%", "20-bar money flow -- institutional buying/selling"],
            ["Breadth", "15%", "% of constituent stocks above 50-SMA"],
            ["Smart Money", "10%", "Insider buys, put/call ratio, unusual volume"],
        ],
        [30, 14, 126],
    )

    # ═══════════════════════════════════════════════════════
    # LEVEL 3: Rotation Confirmation
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.level_heading(
        "3", "Rotation Confirmation",
        "Is this a real rotation or noise?",
        "/rotation -- verify the sector rotation is genuine and tradeable."
    )

    pdf.table(
        ["Breadcrumb", "Where to Look", "What You Want"],
        [
            ["Lifecycle Stage", "Rotation Tracker > Active", "EARLY (<=5 days) = prime entry window"],
            ["Conviction", "Rotation Tracker > Badge", "HIGH (>=6) or MODERATE (>=3)"],
            ["Signal Count", "Rotation Tracker > Sparkline", "2+ of 3 signals (RS cross, vol surge, >50MA)"],
            ["Regime Align", "Rotation Tracker > Badge", "Green 'Aligned' = regime favors this sector"],
            ["Action Signal", "Rotation Tracker > Badge", "ENTER (green) or ADD ON PULLBACK (cyan)"],
            ["Signal Trend", "Rotation Tracker > Sparkline", "Stable or improving over last 3 days"],
        ],
        [28, 56, 86],
    )

    pdf.callout_box(
        "KILL SWITCH",
        "Lifecycle = LATE or EXHAUSTING, conviction = LOW or EXIT, action = HOLD or EXIT "
        "-- you missed it, move on. Don't chase a rotation that's already played out.",
        "red",
    )

    pdf.sub_heading("How Rotations Are Detected")
    pdf.body_text("Three independent signals are computed daily for each ETF:")
    pdf.table(
        ["Signal", "Condition", "What It Detects"],
        [
            ["RS Golden Cross", "10d SMA of RS > 30d SMA", "Relative strength inflection"],
            ["Volume Surge", "Daily volume > 1.5x 20d avg", "Institutional participation"],
            ["Price Breakout", "Close > 50d SMA", "Trend confirmation"],
        ],
        [35, 55, 80],
    )
    pdf.bold_bullet("Start:", "First day with 2+ signals where all prior 5 days had < 2 signals")
    pdf.bold_bullet("End:", "3+ consecutive days with fewer than 2 signals")

    pdf.sub_heading("Lifecycle Stages")
    pdf.table(
        ["Stage", "Days Active", "Your Response"],
        [
            ["EARLY", "<= 5 days", "Prime entry -- initiate position"],
            ["MATURING", "6-15 days", "Established -- add on pullbacks"],
            ["LATE", "16-30 days", "Extended -- tighten stops, no new entries"],
            ["EXHAUSTING", ">30 days or fading", "Exit -- rotation playing out"],
        ],
        [30, 42, 98],
    )

    pdf.sub_heading("Action Signals")
    pdf.body_text("Combines lifecycle + conviction + regime alignment:")
    pdf.table(
        ["Action", "When It Fires"],
        [
            ["ENTER", "EARLY + HIGH/MODERATE conviction + regime not headwind"],
            ["ADD ON PULLBACK", "MATURING + MODERATE+ conviction + regime not headwind"],
            ["HOLD / TIGHTEN", "LATE, or MATURING+LOW, or headwind+MODERATE"],
            ["EXIT", "EXHAUSTING, or EXIT conviction, or headwind+LOW"],
        ],
        [38, 132],
    )

    # ═══════════════════════════════════════════════════════
    # LEVEL 4: Stock Selection
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.level_heading(
        "4", "Stock Selection",
        "Which stocks in this sector will move most?",
        "/sectors/picks -- combines all upstream data into actionable stock picks."
    )

    pdf.table(
        ["Breadcrumb", "Where to Look", "What You Want"],
        [
            ["Entry Signals", "Picks > top of page", "Stocks passing ALL 4 gates (ENTER, CMF>0, accel>0, quality)"],
            ["Pre-Runner Radar", "Picks > below Entry Sigs", "Turnarounds + Leaders scored 0-100 by RS accel"],
            ["RS Acceleration", "Picks > Radar table", "High positive = catching up fast (SEER had 24.29)"],
            ["Conviction", "Picks > badge color", "GREEN (HIGH) or CYAN (MEDIUM)"],
            ["Phase", "Picks > Stock Picks table", "P2_TURNAROUND = inflection, P3_TRENDING = uptrend"],
            ["Volume Ratio", "Picks > table", ">=1.2x confirming, >=1.5x strong institutional"],
            ["Top Picks", "Picks > grouped section", "Pre-ranked top 3 per sector by conviction + RS accel"],
        ],
        [28, 52, 90],
    )

    pdf.sub_heading("What Makes a Pre-Runner")
    pdf.body_text(
        "The Pre-Runner Radar automates the pattern: a lagging stock in a leading sector that "
        "starts showing relative strength. When the sector is running and a laggard begins "
        "catching up, it often snaps violently. Look for:"
    )
    pdf.bullet("Stock below 50-SMA but RS acceleration is high and positive")
    pdf.bullet("Sector in LEADING or IMPROVING quadrant with strong acceleration")
    pdf.bullet("Volume ratio >= 1.0 confirming institutional interest")
    pdf.bullet("Classification: TURNAROUND (not AVOID)")

    pdf.sub_heading("Stock Classifications")
    pdf.table(
        ["Category", "What It Means", "Action"],
        [
            ["LEADER", "Above 50-SMA, outperforming ETF, volume", "Core position -- ride the trend"],
            ["CATCH_UP", "Above 50-SMA but lagging ETF", "Watchlist -- needs catalyst"],
            ["TURNAROUND", "RS accelerating from below", "Entry candidate -- the pre-runner"],
            ["AVOID", "No favorable signals", "Skip -- don't force it"],
        ],
        [28, 60, 82],
    )

    pdf.sub_heading("Conviction Levels")
    pdf.table(
        ["Level", "Score", "Meaning"],
        [
            ["HIGH", ">= 4.0", "Strong setup -- full position size"],
            ["MEDIUM", ">= 2.5", "Decent setup -- reduced size or wait for pullback"],
            ["WATCH", "< 2.5", "Developing -- monitor, don't act yet"],
        ],
        [25, 20, 125],
    )

    # ═══════════════════════════════════════════════════════
    # CASE STUDY: SEER
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(20, 60, 120)
    pdf.cell(0, 10, "Case Study: The SEER Playbook", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    pdf.body_text(
        "SEER spiked after-hours on July 2, 2026. Working backwards from the data, here's "
        "how the framework would have surfaced it at each level:"
    )

    pdf.sub_heading("Level 1: Macro")
    pdf.bullet("Regime favorable -- biotech in the favored sectors list")
    pdf.bullet("Posture was ACTIVE -- environment supported new entries")
    pdf.bullet("No kill signals (no excessive risk flags)")

    pdf.sub_heading("Level 2: Sector")
    pdf.bullet("XBI in LEADING quadrant with acceleration 10.84 (very strong)")
    pdf.bullet("CMF positive -- institutional money flowing into biotech")
    pdf.bullet("Sub-sector signal: XBI leading its parent XLV")

    pdf.sub_heading("Level 3: Rotation")
    pdf.bullet("Biotech rotation active with ENTER action signal")
    pdf.bullet("SEER flagged as turnaround candidate in the stock performance table")

    pdf.sub_heading("Level 4: Stock")
    pdf.bullet("RS Acceleration: 24.29 (extremely high -- fastest in the group)")
    pdf.bullet("RS Improving: true")
    pdf.bullet("RS Delta: +11.24 (massive relative strength gain)")
    pdf.bullet("Below 50-SMA -- classic pre-runner setup")
    pdf.bullet("Turnaround candidate: true")

    pdf.callout_box(
        "THE SIGNAL",
        "A below-50MA stock in a leading sector with the highest RS acceleration in the group. "
        "That's the catch-up play -- when the sector is running and a laggard starts showing "
        "relative strength, it often snaps violently. The Pre-Runner Radar now automates this "
        "exact pattern detection.",
        "blue",
    )

    # ═══════════════════════════════════════════════════════
    # APPENDIX A: Scoring Reference
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.appendix_heading("Appendix A: Scoring Reference")

    pdf.sub_heading("Sector Composite Score (0-100)")
    pdf.body_text(
        "Dynamic weight redistribution: when breadth or smart money data is missing, "
        "their weights are redistributed proportionally to available factors."
    )
    pdf.table(
        ["Factor", "Base Weight", "Normalization"],
        [
            ["Momentum", "25", "Percentile rank across all 31 ETFs"],
            ["Mansfield RS", "20", "Clamped to [-20, +20]"],
            ["Acceleration", "15", "Min-max across the ETF universe"],
            ["CMF", "15", "Clamped to [-1, +1]"],
            ["Breadth", "15", "Percentage (0-100%)"],
            ["Smart Money", "10", "Aggregate of 4 sub-signals"],
        ],
        [35, 22, 113],
    )

    pdf.sub_heading("Rotation Conviction Scoring")
    pdf.table(
        ["Factor", "Range", "How It Scores"],
        [
            ["Quadrant", "-1 to +3", "LEADING=3, IMPROVING=2, WEAKENING=0, LAGGING=-1"],
            ["Acceleration", "-1 to +2", ">1.0: +2, >0: +1, else -1"],
            ["CMF (20-bar)", "-1 to +2", ">0.1: +2, >0: +1, else -1"],
            ["Signal trend", "-1 to +1", "Last 3 improving: +1, declining: -1"],
        ],
        [28, 22, 120],
    )

    pdf.sub_heading("Stock Conviction Scoring")
    pdf.body_text(
        "Structural (sector-level) signals weighted higher than tactical (stock-level):"
    )
    pdf.table(
        ["Signal", "Weight", "Condition"],
        [
            ["Sector quadrant", "1.5", "IMPROVING or LEADING"],
            ["Sector composite", "1.5", ">= 70"],
            ["Stock category", "1.0", "TURNAROUND or LEADER"],
            ["RS acceleration", "1.0", ">= 3.0"],
            ["Sector stealth", "1.0", "Stealth flag + confirming volume/category"],
            ["Volume ratio", "0.5", ">= 1.2"],
        ],
        [35, 15, 120],
    )

    pdf.sub_heading("Leadership Health Score (0-100)")
    pdf.body_text(
        "Measures market leadership breadth from 4 baskets (MAGS, QQQ, IWM, ARKK) "
        "plus confirming indicators (SMH, IGV, HYG)."
    )
    pdf.table(
        ["Score", "Label", "Interpretation"],
        [
            [">= 80", "Broad & Healthy", "All market segments participating"],
            [">= 65", "Healthy", "Most segments healthy"],
            [">= 50", "Narrowing", "Concentration risk building"],
            [">= 35", "Narrow", "Rally dependent on few names"],
            ["< 35", "Deteriorating", "Broad weakness -- risk-off signal"],
        ],
        [25, 40, 105],
    )

    # ═══════════════════════════════════════════════════════
    # APPENDIX B: Quality Gates & Classification
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.appendix_heading("Appendix B: Quality Gates & Classification")

    pdf.sub_heading("Stock Quality Gates (7 gates)")
    pdf.body_text(
        "Every stock must pass these gates to appear in picks. Failing the extension "
        "gate moves the stock to a pullback watch list instead of rejecting it."
    )
    pdf.table(
        ["Gate", "Threshold", "If Failed"],
        [
            ["1. Market cap", ">= $2B", "Rejected (too small)"],
            ["2. Avg volume", ">= 1M shares/day", "Rejected (illiquid)"],
            ["3. Volume spike", "<= 5x average", "Rejected (blow-off)"],
            ["4. Extension", "<= 80% above 200-SMA", "Pullback watch list"],
            ["5. Trend position", "Above 50-SMA or turnaround", "Rejected"],
            ["6. Institutional", ">= 30% ownership", "Rejected (no backing)"],
            ["7. Correlation", "|20d ret vs ETF| <= 30%", "Rejected (disconnected)"],
        ],
        [30, 52, 60],
    )

    pdf.sub_heading("Phase Classification")
    pdf.table(
        ["Phase", "Criteria", "What It Means"],
        [
            ["P1_BASING", "Below 50-SMA + positive RS accel", "Building a base -- early"],
            ["P2_TURNAROUND", "Near 50-SMA + RS accel >0.5 + vol >=1.2x", "Inflection point -- entry"],
            ["P3_TRENDING", "Above 50-SMA + >3% from SMA + vol >=0.7x", "Uptrend confirmed -- ride it"],
            ["P4_EXHAUSTING", "Above 50-SMA + (RS accel < -2 or sector < -3)", "Topping -- exit"],
        ],
        [30, 68, 72],
    )

    pdf.sub_heading("Risk Flags (10 independent checks)")
    pdf.table(
        ["#", "Flag", "Severity"],
        [
            ["1", "LEADING sector with negative acceleration", "High"],
            ["2", "Active rotation with declining signal count", "Medium"],
            ["3", "VIX rising (or regime data unavailable)", "High"],
            ["4", "Sector data quality < 50%", "Medium"],
            ["5", "Recently ended rotation < 5 days (false start)", "Medium"],
            ["6", "Correlation breakdown (XLY/XLP vs XLK/XLU)", "High"],
            ["7", "Panic rotation (dispersion > 10 + RISK_OFF)", "High"],
            ["8", "Narrow/deteriorating leadership health", "Med/High"],
            ["9", "High rotation velocity + negative accel (rollover)", "Medium"],
            ["10", "Cross-asset risk-off (GLD/TLT accelerating)", "Med/High"],
        ],
        [8, 110, 25],
    )

    # ═══════════════════════════════════════════════════════
    # APPENDIX C: Configuration & Key Files
    # ═══════════════════════════════════════════════════════
    pdf.add_page()
    pdf.appendix_heading("Appendix C: Configuration & Key Files")

    pdf.sub_heading("ETF Universe (31 total)")
    pdf.table(
        ["Category", "Count", "ETFs"],
        [
            ["GICS Sectors", "14", "XLK, XLF, XLE, XLV, XLI, XLY, XLP, XLU, XLB, XLRE, XLC, SMH, IGV, XBI"],
            ["Sub-Sectors", "8", "XHB, XME, KRE, XOP, IBB, HACK, KWEB, TAN"],
            ["Cross-Asset", "5", "TLT, HYG, GLD, UUP, DBA"],
            ["Leadership", "4", "MAGS, QQQ, IWM, ARKK"],
        ],
        [30, 15, 125],
    )

    pdf.sub_heading("Configuration Sections (config.ts)")
    pdf.body_text(
        "All scoring thresholds are centralized in src/lib/sector-rotation/config.ts. "
        "Never hardcode thresholds in scoring logic -- always import from config."
    )
    pdf.table(
        ["Section", "Purpose"],
        [
            ["REGIME", "VIX adaptive bounds, yield/DXY thresholds, cross-asset"],
            ["COMPOSITE", "Actionable/watch thresholds, base weights, hysteresis"],
            ["ROTATION", "Dispersion, signal start/end, volume surge, min days"],
            ["QUALITY_GATES", "Market cap, volume, extension, institutional gates"],
            ["CONVICTION", "Signal weights, HIGH/MEDIUM score thresholds"],
            ["LEADERSHIP", "Health score labels, breadth spread thresholds"],
            ["RISK_FLAGS", "Data quality, panic, rollover, narrow leadership"],
            ["POSTURE", "Rotation count and dispersion per posture level"],
            ["SMART_MONEY", "Insider, put/call ratio, unusual volume, earnings"],
            ["CLASSIFICATION", "Phase boundaries (P1-P4), RS accel descriptors"],
            ["SCORING_SIGNALS", "Divergence, stealth, trend, pair, momentum, OBV"],
        ],
        [40, 130],
    )

    pdf.sub_heading("Key Files")
    pdf.table(
        ["File", "Purpose"],
        [
            ["config.ts", "All thresholds and scoring breakpoints (17 sections)"],
            ["sector-rotation.ts", "Main engine -- calculateSectorRotation()"],
            ["stock-enrichment.ts", "Quality gates, classification, conviction"],
            ["brief.ts", "Market posture, sector tiers, risk flags"],
            ["rotation-tracker.ts", "Rotation signals, lifecycle, stock performance"],
            ["regime.ts", "Macro regime classification (VIX/yield/DXY)"],
            ["leadership-health.ts", "Leadership health score from 4 baskets"],
            ["math.ts", "Pure math: ROC, momentum, RS, CMF, OBV, RRG"],
            ["rotation-helpers.ts", "Lifecycle stage, conviction, action signals"],
            ["history.ts", "LocalStorage snapshot persistence (60-day)"],
        ],
        [42, 128],
    )

    # ─── Data Flow Diagram ───
    pdf.ln(3)
    pdf.sub_heading("Data Flow")
    pdf.code_block(
        "Yahoo Finance (VIX, TNX, DXY, 31 ETFs, ~400 stocks)\n"
        "        |\n"
        "        v\n"
        "Level 1: Macro Regime  -->  Posture (AGGRESSIVE..CASH)\n"
        "        |\n"
        "        v\n"
        "Level 2: Sector Scoring  -->  Quadrants, Stealth, Tiers\n"
        "        |\n"
        "        v\n"
        "Level 3: Rotation Tracker  -->  Lifecycle, Conviction, Action\n"
        "        |\n"
        "        v\n"
        "Level 4: Stock Enrichment  -->  Gates, Phase, Picks, Radar"
    )

    # ─── Output ───
    output_path = "Sector_Rotation_Framework_v2.pdf"
    pdf.output(output_path)
    print(f"PDF generated: {output_path}")
    return output_path


if __name__ == "__main__":
    build_pdf()
