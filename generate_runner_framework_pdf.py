"""Generate a PDF of the Runner Detection Framework -- practical playbook format."""

from fpdf import FPDF


class RunnerPDF(FPDF):
    def __init__(self):
        super().__init__("P", "mm", "Letter")
        self.set_auto_page_break(auto=True, margin=20)

    def header(self):
        if self.page_no() > 1:
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(120, 120, 120)
            self.cell(0, 5, "Runner Detection Framework  |  QuantRadar", align="R")
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
        self.set_text_color(80, 40, 160)
        self.cell(0, 14, "Runner Detection", align="C", new_x="LMARGIN", new_y="NEXT")
        self.cell(0, 14, "Framework", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(8)
        self.set_font("Helvetica", "I", 16)
        self.set_text_color(60, 60, 60)
        self.cell(0, 10, "How Nine Scanners Combine to Detect Runners", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(20)
        self.set_font("Helvetica", "", 11)
        self.set_text_color(100, 100, 100)
        self.cell(0, 7, "QuantRadar Platform", align="C", new_x="LMARGIN", new_y="NEXT")
        self.ln(35)

        # Overview box
        self.set_fill_color(245, 240, 255)
        self.set_draw_color(80, 40, 160)
        x = 25
        w = self.w - 50
        self.rect(x, self.get_y(), w, 55, style="FD")
        self.set_x(x + 5)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(80, 40, 160)
        self.cell(w - 10, 8, "The Core Idea", new_x="LMARGIN", new_y="NEXT")
        self.set_x(x + 5)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(50, 50, 50)
        lines = [
            "A runner is a stock that makes a sustained 20%+ move from a",
            "well-defined accumulation base. This framework shows how to",
            "detect them before they move using cross-scanner confluence.",
            "",
            "Discovery: Find stocks on multiple scanners (nightly summary, daily pages)",
            "Confirmation: Verify sector context, institutional backing, score trajectory",
            "Entry: Scale in at structural trigger levels with defined stops",
            "Management: Add on pullbacks, trail stops, exit when scanners diverge",
        ]
        for line in lines:
            self.set_x(x + 5)
            self.cell(w - 10, 5.5, line, new_x="LMARGIN", new_y="NEXT")

    def section_heading(self, number, title):
        self.ln(3)
        self.set_fill_color(80, 40, 160)
        bar_w = self.w - self.l_margin - self.r_margin
        self.rect(self.l_margin, self.get_y(), bar_w, 10, style="F")
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(255, 255, 255)
        self.set_x(self.l_margin + 3)
        self.cell(0, 10, f"{number}. {title}", new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

    def sub_heading(self, title):
        self.ln(3)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(80, 40, 160)
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
        else:  # violet
            self.set_fill_color(245, 240, 255)
            self.set_draw_color(100, 50, 180)
            label_color = (80, 40, 160)

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
        self.set_fill_color(80, 40, 160)
        self.set_text_color(255, 255, 255)
        for i, h in enumerate(headers):
            self.cell(col_widths[i], row_height, h, border=1, fill=True, align="C")
        self.ln()

        self.set_font("Helvetica", "", 8)
        self.set_text_color(40, 40, 40)
        for ri, row in enumerate(rows):
            fill = ri % 2 == 0
            if fill:
                self.set_fill_color(248, 245, 255)
            else:
                self.set_fill_color(255, 255, 255)
            for i, cell_val in enumerate(row):
                self.cell(col_widths[i], row_height, str(cell_val), border=1, fill=True)
            self.ln()
        self.ln(2)


def build_pdf():
    pdf = RunnerPDF()
    pdf.alias_nb_pages()
    pdf.set_margins(20, 15, 20)

    # ---- Title Page ----
    pdf.title_page()

    # ---- Table of Contents ----
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(80, 40, 160)
    pdf.cell(0, 10, "Contents", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    toc = [
        ("1", "What Is a Runner?", ""),
        ("2", "Runner Lifecycle (6 Stages)", ""),
        ("3", "4-Stage Entry Process", ""),
        ("4", "Pump-and-Dump Checklist", ""),
        ("5", "Confluence Rules", ""),
        ("6", "Scanner Combinations", ""),
        ("7", "Daily Playbook", ""),
        ("8", "Risk Management", ""),
    ]
    for num, title, route in toc:
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(80, 40, 160)
        pdf.cell(85, 7, f"  {num}. {title}")
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 7, route, new_x="LMARGIN", new_y="NEXT")

    # ============================================================
    # 1. WHAT IS A RUNNER?
    # ============================================================
    pdf.add_page()
    pdf.section_heading("1", "What Is a Runner?")

    pdf.body_text(
        "A runner is a stock that makes a sustained, multi-day move of 20%+ from a "
        "well-defined accumulation base. Unlike gap-and-fade momentum plays, runners have "
        "institutional backing, structural confirmation, and identifiable entry points "
        "before the move begins."
    )

    pdf.sub_heading("Runner Characteristics")
    pdf.bold_bullet("Deep pullback origin:", "20-50% from ATH, seller exhaustion visible")
    pdf.bold_bullet("Accumulation phase:", "Volume dries up, OBV diverges positive, range tightens")
    pdf.bold_bullet("Structural transition:", "Higher lows form, Change of Character (ChoCH) confirmed")
    pdf.bold_bullet("Sector tailwind:", "Stock's sector is in IMPROVING or LEADING quadrant")
    pdf.bold_bullet("Institutional:", "Volume expands on breakout days, not before")
    pdf.bold_bullet("Multi-scanner:", "Shows up on 3+ independent scanning engines")

    pdf.sub_heading("Runners vs Momentum Plays")
    pdf.table(
        ["Dimension", "Runner", "Momentum Play"],
        [
            ["Holding period", "Days to weeks", "Minutes to hours"],
            ["Entry timing", "Before or at breakout", "After breakout (chase)"],
            ["Volume pattern", "Quiet base, then expansion", "Already extended volume"],
            ["Risk/reward", "Defined invalidation level", "Wide stops or none"],
            ["Detection", "Multi-scanner confluence", "Price/volume screen only"],
        ],
        [35, 62, 73],
    )

    # ============================================================
    # 2. RUNNER LIFECYCLE
    # ============================================================
    pdf.add_page()
    pdf.section_heading("2", "Runner Lifecycle (6 Stages)")

    pdf.body_text(
        "Every runner goes through six identifiable stages. Each stage maps to specific "
        "scanners that detect it. The goal is to identify the stock in stages 2-4 and "
        "enter before stage 5."
    )

    pdf.table(
        ["Stage", "Name", "What Happens", "Scanner Detection"],
        [
            ["1", "Markdown", "Active downtrend, lower H/L", "None (filtered out)"],
            ["2", "Seller Exhaustion", "Down-vol declining, RSI recovering", "Inflection SE, Transition SE"],
            ["3", "Accumulation", "Range-bound, OBV divergence", "Inflection VC+BE, Transition Acc"],
            ["4", "Structural Confirm", "Higher lows, ChoCH, BOS", "Transition ARMED, Inflection IP"],
            ["5", "Breakout", "Volume expansion, trigger crossed", "Transition TRIGGERED, Inst"],
            ["6", "Sustained Run", "Trending higher, pullbacks", "Transition MARKUP, Setup LD"],
        ],
        [14, 32, 55, 69],
    )

    pdf.callout_box(
        "KEY INSIGHT",
        "The best entries are at stages 3-4 when the structural shift is confirmed but "
        "the breakout hasn't happened yet. The High Conviction filter on the Inflection "
        "and Transition pages identifies exactly these stocks.",
        "violet",
    )

    pdf.sub_heading("Stage-to-Scanner Mapping")
    pdf.body_text(
        "Inflection detects WHERE in the accumulation cycle (stage classification), while "
        "Transition detects STRUCTURAL changes (swing pivots, ChoCH, BOS). They answer "
        "different questions about the same stock, which is why overlap between them is "
        "the strongest signal."
    )

    # ============================================================
    # 3. 4-STAGE ENTRY PROCESS
    # ============================================================
    pdf.add_page()
    pdf.section_heading("3", "4-Stage Entry Process")

    pdf.sub_heading("Level 1: Discovery")
    pdf.table(
        ["Source", "What to Look For", "Route"],
        [
            ["Nightly Summary", "Confluence tiers 3/5 or higher", "Telegram"],
            ["Inflection Daily", "STARTER/ADD_ON + TRANS badge", "/prerun/inflection-daily"],
            ["Transition Daily", "TRIGGERED/READY + INF badge", "/prerun/transition-daily"],
            ["High Conviction", "Toggle on either page", "Filter bar button"],
        ],
        [38, 75, 57],
    )

    pdf.sub_heading("Level 2: Confirmation")
    pdf.bold_bullet("Sector quadrant:", "Is sector IMPROVING or LEADING? (quadrant badge)")
    pdf.bold_bullet("Institutional:", "Does INST badge appear? Classification ACCUM/LEADER = confirmed")
    pdf.bold_bullet("Cross-scanner:", "How many independent scanners flag this ticker?")
    pdf.bold_bullet("Streak:", "Has stock appeared for 2+ consecutive days?")
    pdf.bold_bullet("Trajectory:", "Is the delta positive? (rising score = strengthening)")

    pdf.sub_heading("Level 3: Entry")
    pdf.table(
        ["Signal", "Action", "Position Size"],
        [
            ["Trans ARMED + Inf STARTER", "Build starter (1/3 size)", "0.5-1% risk"],
            ["Trans TRIGGERED + vol expansion", "Add to position (2/3)", "0.5-1% risk"],
            ["Inf ADD_ON + pullback to support", "Full position (3/3)", "0.5% risk"],
        ],
        [55, 60, 55],
    )

    pdf.sub_heading("Level 4: Add / Hold / Exit")
    pdf.bold_bullet("Add:", "Stock pulls back to trigger level, Inf reads ADD_ON, Trans still TRIGGERED")
    pdf.bold_bullet("Hold:", "Stock trending, Trans in SUSTAINED_MARKUP, score stable/rising")
    pdf.bold_bullet("Tighten:", "Trans moves to EXTENDED, or delta negative for 2+ days")
    pdf.bold_bullet("Exit:", "Price breaks below invalidation, or stock drops off all scanners")

    # ============================================================
    # 4. PUMP-AND-DUMP CHECKLIST
    # ============================================================
    pdf.add_page()
    pdf.section_heading("4", "Pump-and-Dump Checklist")

    pdf.body_text(
        "Not every stock on multiple scanners is a legitimate runner. Use these seven "
        "filters to distinguish real institutional accumulation from manufactured moves:"
    )

    pdf.table(
        ["#", "Check", "Red Flag If", "Where to Check"],
        [
            ["1", "Market cap", "Below $8B", "Quality gate (auto)"],
            ["2", "Dollar volume", "Below $100M/day", "Quality gate (auto)"],
            ["3", "Volume pattern", "Spike without base", "Inf VC, Trans Acc scores"],
            ["4", "Inst. presence", "No INST badge or AVOID", "Flags column"],
            ["5", "Sector alignment", "LAGGING quadrant", "Quadrant badge"],
            ["6", "Score composition", "Only 1-2 sub-scores high", "Mini score bars"],
            ["7", "Extension risk", "EXT flag or 40%+ from base", "Flags column"],
        ],
        [8, 30, 55, 55],
    )

    pdf.callout_box(
        "STOP -- DO NOT ENTER IF:",
        "3+ red flags from the checklist above, OR stock only on ONE scanner, "
        "OR institutional classification is AVOID/DISTRIBUTION, OR sector quadrant "
        "is LAGGING with negative acceleration.",
        "red",
    )

    # ============================================================
    # 5. CONFLUENCE RULES
    # ============================================================
    pdf.add_page()
    pdf.section_heading("5", "Confluence Rules")

    pdf.body_text(
        "The nightly summary assigns a confluence tier (1/5 to 5/5) based on how many "
        "independent scanners detect a stock. Higher tiers have dramatically better hit rates."
    )

    pdf.sub_heading("5 Confluence Scanners")
    pdf.table(
        ["Scanner", "Label", "Detects", "Best for Stage"],
        [
            ["Setup (PreRun)", "Setup", "Base breakouts from pullbacks", "3-5"],
            ["Inflection", "Inflect", "Accumulation cycle transitions", "2-4"],
            ["VCP", "VCP", "Volatility contraction patterns", "4"],
            ["Institutional", "Inst", "Institutional-quality runners", "5-6"],
            ["PreRunner (Rot)", "Rot", "Sector rotation leaders", "3-5"],
        ],
        [35, 16, 65, 28],
    )

    pdf.sub_heading("Badge-Only (Not Counted for Confluence)")
    pdf.bullet("QFE -- Quality-Factor-Entry rating (derived from PreRun, no new info)")
    pdf.bullet("Setup4h -- 4h-candle variant of Setup (same methodology)")
    pdf.bullet("Transition -- Market structure transitions (trial, comparing vs Inflection)")
    pdf.bullet("INF WATCH -- Inflection WATCH reads (low conviction)")

    pdf.sub_heading("Tier Interpretation")
    pdf.table(
        ["Tier", "Meaning", "Action"],
        [
            ["5/5", "All five agree -- extremely rare", "Highest conviction, full size"],
            ["4/5", "Four scanners agree -- strong", "High conviction, standard size"],
            ["3/5", "Three agree -- solid setup", "Moderate conviction, reduced size"],
            ["2/5", "Two agree -- developing", "Watchlist only"],
            ["1/5", "Single scanner -- unconfirmed", "Monitor, do not act"],
        ],
        [14, 60, 66],
    )

    # ============================================================
    # 6. SCANNER COMBINATIONS
    # ============================================================
    pdf.add_page()
    pdf.section_heading("6", "Scanner Combinations")

    pdf.sub_heading("Best Combinations for Early Detection")
    pdf.table(
        ["Combination", "Signal", "Stage"],
        [
            ["Inf STARTER + Trans ARMED", "Both detect accum-to-markup shift", "3-4"],
            ["Trans TRIGGERED + Institutional", "Structural breakout + inst volume", "5"],
            ["Setup + VCP + Rotation", "Pullback + compression + sector wind", "4"],
            ["Inf ADD_ON + Trans MARKUP", "Runner pulling back to add level", "6"],
        ],
        [52, 70, 18],
    )

    pdf.sub_heading("Sector Context Amplifiers")
    pdf.bold_bullet("IMPROVING quadrant:", "Early institutional accumulation, best risk/reward")
    pdf.bold_bullet("LEADING quadrant:", "Momentum confirmed, trend continuation likely")
    pdf.bold_bullet("Rotation ENTER:", "Active sector rotation with high conviction (/rotation)")
    pdf.bold_bullet("Regime RISK_ON:", "Macro supports risk-taking (/sectors/brief)")

    pdf.callout_box(
        "DANGEROUS COMBINATIONS -- AVOID",
        "Single scanner + LAGGING sector (fighting tide), Transition TRIGGERED without "
        "Inflection/Setup (false breakout risk), Institutional AVOID + any scanner "
        "(smart money selling), High score + declining delta 3+ days (deteriorating setup).",
        "red",
    )

    # ============================================================
    # 7. DAILY PLAYBOOK
    # ============================================================
    pdf.add_page()
    pdf.section_heading("7", "Daily Playbook")

    pdf.sub_heading("Pre-Market (8:00-9:30 AM ET)")
    pdf.bullet("Check Telegram nightly summary -- note any 3/5+ confluence tickers")
    pdf.bullet("Visit /sectors/brief -- check regime, posture, risk flags")
    pdf.bullet("Visit /sectors -- identify IMPROVING and LEADING sectors")
    pdf.bullet("Check /api/premarket futures -- confirm bias direction")

    pdf.sub_heading("Scanner Review (9:30-10:00 AM ET)")
    pdf.bullet("Open /prerun/inflection-daily -- filter STARTER/ADD_ON, look for TRANS + INST badges")
    pdf.bullet("Open /prerun/transition-daily -- check TRIGGERED/READY, look for INF + INST badges")
    pdf.bullet("Toggle High Conviction on either page -- these are your top candidates")
    pdf.bullet("Cross-reference with sector quadrant badges -- prioritize IMPROVING/LEADING")
    pdf.bullet("Run pump-and-dump checklist on each candidate")

    pdf.sub_heading("During Market Hours")
    pdf.bullet("Watch trigger levels (Transition ARMED stocks have trigger prices in expanded row)")
    pdf.bullet("Scale in on confirmation -- don't front-run, wait for volume at trigger")
    pdf.bullet("Set invalidation stops from Transition's expanded row")
    pdf.bullet("Monitor scanner scores -- stable/rising = hold, declining = investigate")

    pdf.sub_heading("Post-Market (After 10:00 PM ET)")
    pdf.bullet("Cron jobs finish by ~11 PM ET. New data on all daily pages")
    pdf.bullet("Check Telegram nightly summary for updated confluence tiers")
    pdf.bullet("Review dropped tickers -- if position dropped off, investigate")
    pdf.bullet("Plan next day's watchlist from high-conviction candidates")

    # ============================================================
    # 8. RISK MANAGEMENT
    # ============================================================
    pdf.add_page()
    pdf.section_heading("8", "Risk Management")

    pdf.sub_heading("Position Sizing by Conviction")
    pdf.table(
        ["Conviction", "Confluence", "Max Risk/Trade", "Max Allocation"],
        [
            ["Maximum", "4-5/5 + HC + IMPROVING sector", "1.5% portfolio", "8-10%"],
            ["Standard", "3/5 + LEADING/IMPROVING", "1.0% portfolio", "5-7%"],
            ["Starter", "2/5 + developing signals", "0.5% portfolio", "3-4%"],
            ["Watchlist", "1/5 or no sector confirm", "No position", "0%"],
        ],
        [28, 58, 40, 34],
    )

    pdf.sub_heading("Stop Placement")
    pdf.bold_bullet("Initial:", "Transition invalidation level (structural stop below swing low)")
    pdf.bold_bullet("Breakeven:", "Move to entry price once stock moves 1R in your favor")
    pdf.bold_bullet("Trailing:", "Trail below most recent higher low on daily timeframe")
    pdf.bold_bullet("Scanner-based:", "Exit if stock drops from all scanners for 2 consecutive days")

    pdf.sub_heading("Portfolio-Level Rules")
    pdf.callout_box(
        "PORTFOLIO LIMITS",
        "Max open positions: 5-8. Max sector concentration: 3 positions. "
        "Max daily risk: 3% across all positions. Correlation check: don't stack "
        "same sub-sector. Regime override: DEFENSIVE = reduce 50%, CASH = close all.",
        "violet",
    )

    pdf.sub_heading("When NOT to Trade")
    pdf.bullet("Regime is RISK_OFF + 3+ risk flags")
    pdf.bullet("VIX spike above adaptive upper bound")
    pdf.bullet("No stocks pass High Conviction filter on either page")
    pdf.bullet("Already at max positions and all are working")
    pdf.bullet("Major economic event day (FOMC, CPI, NFP) -- wait for reaction")

    # ---- Output ----
    output_path = "Runner_Detection_Framework.pdf"
    pdf.output(output_path)
    print(f"PDF generated: {output_path}")
    return output_path


if __name__ == "__main__":
    build_pdf()
