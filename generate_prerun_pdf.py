"""Generate Pre-Run Scanner Top-Down Analysis Framework PDF."""
from fpdf import FPDF


class PDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, "QuantRadar - Pre-Run Scanner Framework", align="R")
        self.ln(4)
        self.set_draw_color(180, 180, 180)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(6)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def section_title(self, title):
        self.ln(6)
        self.set_draw_color(200, 200, 200)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(4)
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(30, 30, 30)
        self.cell(0, 10, title)
        self.ln(10)

    def sub_title(self, title):
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(50, 50, 50)
        self.ln(2)
        self.cell(0, 8, title)
        self.ln(8)

    def body_text(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5.5, text)
        self.ln(2)

    def bold_text(self, text):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5.5, text)
        self.ln(2)

    def bullet(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        self.set_x(10)
        self.multi_cell(190, 5.5, "  - " + text)

    def warning_box(self, text):
        self.set_fill_color(255, 248, 230)
        self.set_draw_color(220, 180, 50)
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(150, 100, 0)
        y = self.get_y()
        lines = self.multi_cell(186, 4, text, dry_run=True, output="LINES")
        h = max(12, len(lines) * 4 + 6)
        if y + h > self.h - self.b_margin:
            self.add_page()
            y = self.get_y()
        self.rect(10, y, 190, h, "DF")
        self.set_xy(12, y + 3)
        self.multi_cell(186, 4, text)
        self.set_y(y + h + 4)

    def tip_box(self, text):
        self.set_fill_color(230, 245, 255)
        self.set_draw_color(70, 140, 210)
        self.set_font("Helvetica", "", 9)
        self.set_text_color(30, 80, 140)
        y = self.get_y()
        lines = self.multi_cell(186, 4, text, dry_run=True, output="LINES")
        h = max(12, len(lines) * 4 + 6)
        if y + h > self.h - self.b_margin:
            self.add_page()
            y = self.get_y()
        self.rect(10, y, 190, h, "DF")
        self.set_xy(12, y + 3)
        self.multi_cell(186, 4, text)
        self.set_y(y + h + 4)

    def table_header(self, cols, widths):
        # Check if header + at least one row fits
        if self.get_y() + 14 > self.h - self.b_margin:
            self.add_page()
        self.set_font("Helvetica", "B", 9)
        self.set_fill_color(240, 240, 240)
        self.set_text_color(60, 60, 60)
        for i, col in enumerate(cols):
            self.cell(widths[i], 7, col, border=1, fill=True)
        self.ln()

    def table_row(self, cols, widths):
        self.set_font("Helvetica", "", 9)
        self.set_text_color(40, 40, 40)
        max_h = 7
        for i, col in enumerate(cols):
            lines = self.multi_cell(widths[i] - 2, 4, col, dry_run=True, output="LINES")
            h = len(lines) * 5 + 2
            if h > max_h:
                max_h = h
        if self.get_y() + max_h > self.h - self.b_margin:
            self.add_page()
        y_start = self.get_y()
        for i, col in enumerate(cols):
            x = 10 + sum(widths[:i])
            self.set_xy(x, y_start)
            self.rect(x, y_start, widths[i], max_h)
            self.set_xy(x + 1, y_start + 1)
            self.multi_cell(widths[i] - 2, 5, col)
        self.set_y(y_start + max_h)


pdf = PDF()
pdf.alias_nb_pages()
pdf.set_auto_page_break(auto=True, margin=20)

# ── Title Page ──
pdf.add_page()
pdf.ln(40)
pdf.set_font("Helvetica", "B", 28)
pdf.set_text_color(30, 30, 30)
pdf.cell(0, 15, "Pre-Run Scanner", align="C")
pdf.ln(15)
pdf.cell(0, 15, "Framework", align="C")
pdf.ln(20)
pdf.set_font("Helvetica", "", 14)
pdf.set_text_color(100, 100, 100)
pdf.cell(0, 10, "How to Find Multi-Baggers at Their Bases", align="C")
pdf.ln(15)
pdf.set_font("Helvetica", "", 11)
pdf.cell(0, 8, "QuantRadar - Pre-Run Scanner System", align="C")
pdf.ln(8)
pdf.cell(0, 8, "quantradar.com/prerun", align="C")
pdf.ln(30)
pdf.set_draw_color(180, 180, 180)
pdf.line(60, pdf.get_y(), 150, pdf.get_y())
pdf.ln(10)
pdf.set_font("Helvetica", "I", 10)
pdf.set_text_color(150, 150, 150)
pdf.cell(0, 8, "July 2026", align="C")

# ── Overview ──
pdf.add_page()
pdf.section_title("Overview")
pdf.body_text(
    "The Pre-Run system is a screening funnel - it starts with ~467 tickers "
    "(SP500 + NDX100 + select SP400, excluding low-ATR utilities/staples), "
    "eliminates noise through 3 hard gates, scores survivors on 18 criteria, "
    "then filters by 5 preset strategies. Each preset targets a different market "
    "setup. The nightly cron automates all of this and delivers results to your "
    "inbox via Telegram."
)
pdf.bold_text("The Five Levels:")
pdf.bullet("Level 1: Choose Your Preset (/prerun/preset-daily) - What type of setup?")
pdf.bullet("Level 2: Score & Verdict (/prerun/preset-daily) - Which stocks passed?")
pdf.bullet("Level 3: Criteria Deep-Dive (expanded row) - Why did this stock score high?")
pdf.bullet("Level 4: QFE Overlay (/prerun/qfe-daily) - Is the entry quality good?")
pdf.bullet("Level 5: Cross-Reference (/sectors) - Does sector context confirm?")

# ── Level 1 ──
pdf.section_title("Level 1: Choose Your Preset")
pdf.sub_title("Question: What type of setup am I hunting today?")
pdf.body_text(
    "Navigate to /prerun/preset-daily. Select the preset tab that matches "
    "current market conditions."
)

w = [25, 50, 50, 65]
pdf.table_header(["Preset", "What It Finds", "When to Use", "Key Filters"], w)
pdf.table_row(["SNDK", "Deeply beaten-down + short squeeze fuel", "Bear recoveries, high-SI plays", "40%+ from ATH, 15%+ SI, F>=1, score >=18"], w)
pdf.table_row(["Early Mover", "Stage 1-to-2 breakout candidates", "Market turning bullish", "25%+ from ATH, M2+L+F all >=1, score >=14"], w)
pdf.table_row(["Pullback", "Recovery from pullback zones", "Healthy bull, buying dips", "<=40% from ATH, F+L both >=1, score >=17"], w)
pdf.table_row(["Leading", "Strong sector momentum stocks", "Active sector rotation", "LEADING/IMPROVING quad, M+J+F >=1, score >=18"], w)
pdf.table_row(["Stealth", "Hidden accumulation + divergence", "Quiet markets, hidden strength", "OBV/VP divergence, M2>=1, score >=14"], w)

pdf.ln(4)
pdf.tip_box(
    "In a strong bull market, start with Pullback and Leading. In a recovery or "
    "bottoming market, start with SNDK and Early Mover. In a flat/quiet market, "
    "use Stealth to find hidden setups. Use the 4h tab for earlier detection."
)

# ── Level 2 ──
pdf.section_title("Level 2: Score & Verdict")
pdf.sub_title("Question: Which stocks passed and how strong?")
pdf.body_text(
    "On the preset-daily page, review the results table. Every stock here has "
    "already passed 3 hard gates."
)

w = [30, 50, 110]
pdf.table_header(["Breadcrumb", "Column", "What You Want"], w)
pdf.table_row(["Verdict", "Verdict badge", "PRIORITY (score >=19, earnings <=14 days) or KEEP (score >=19)"], w)
pdf.table_row(["Final Score", "Score column", "Higher = more aligned. 19+ = strong, 25+ = rare/exceptional"], w)
pdf.table_row(["Score Delta", "Delta column", "Positive = improving vs yesterday. Rising scores = building momentum"], w)
pdf.table_row(["Streak", "Streak badge", "Consecutive days on list. 3+ days = persistent, not a fluke"], w)
pdf.table_row(["% from ATH", "pctFromAth", "How beaten-down. 40%+ = deep value. 20-30% = moderate discount"], w)
pdf.table_row(["Short Interest", "SI%", "15%+ = squeeze fuel. 20%+ with <$20B cap = max squeeze potential"], w)

pdf.ln(4)
pdf.bold_text("The 3 Hard Gates (auto-applied):")
w2 = [25, 55, 110]
pdf.table_header(["Gate", "Rule", "Purpose"], w2)
pdf.table_row(["Gate 1", ">=20% below ATH", "Only discounted stocks (not already-run names)"], w2)
pdf.table_row(["Gate 2", "No existential risk", "No DOJ/SEC/delisting situations"], w2)
pdf.table_row(["Gate 3", "Price > SMA20 x 0.92", "Must be consolidating, not in freefall"], w2)

pdf.ln(4)
pdf.tip_box("Focus on PRIORITY verdicts first (nearest earnings catalyst), then KEEP verdicts sorted by score descending.")

# ── Level 3 ──
pdf.section_title("Level 3: Criteria Deep-Dive")
pdf.sub_title("Question: Why did this stock score high?")
pdf.body_text(
    "Click any row to expand it. You'll see 18 criteria (A through Q) with individual "
    "scores. Focus on the structural signals:"
)

w = [18, 42, 55, 75]
pdf.table_header(["Code", "Criteria", "Max", "What It Measures"], w)
pdf.table_row(["A", "Dead Money Base", "2", "Drawdown depth + weeks consolidating"], w)
pdf.table_row(["B", "Short Interest", "3", "Short float % (squeeze fuel)"], w)
pdf.table_row(["D", "Earnings Inflection", "3", "Revenue growth + beat streak + proximity"], w)
pdf.table_row(["F", "Volume Accumulation", "3", "Up/down volume ratio + OBV divergence"], w)
pdf.table_row(["H", "Insider Buying", "2", "45-day cluster of insider purchases"], w)
pdf.table_row(["J", "Relative Strength", "2", "Stock return vs sector (20d)"], w)
pdf.table_row(["K", "Breakout Proximity", "2", "% below base high (<=5% = ready)"], w)
pdf.table_row(["L", "Higher Lows", "2", "3-swing low structure"], w)
pdf.table_row(["M2", "EMA 10/20 Timing", "2", "Multi-TF bullish cross confirmation"], w)
pdf.table_row(["N", "Range Coil", "2", "Tight closes + ATR contracting"], w)

pdf.ln(4)
pdf.bold_text("Signal Clusters to Look For:")
w3 = [40, 55, 95]
pdf.table_header(["Cluster", "Criteria Firing", "Interpretation"], w3)
pdf.table_row(["Fundamental + Technical", "D>=2, H>=1, F>=2, M2>=1", "Earnings + insider buying + accumulation + timing = highest conviction"], w3)
pdf.table_row(["Squeeze Setup", "B>=2, A>=1, K>=2, L>=1", "High SI + deep base + near breakout + higher lows"], w3)
pdf.table_row(["Stealth Accumulation", "F>=2, M2>=1, N>=1, J>=1", "Volume divergence + timing + coil + RS = institutional buying"], w3)
pdf.table_row(["Momentum Ignition", "J>=2, M2>=2, K>=1, L>=2", "Strong RS + EMA cross + near breakout = imminent move"], w3)

pdf.ln(4)
pdf.warning_box("A high total score with no D (earnings) or H (insider) = purely technical. Lower conviction than fundamental+technical combos.")

# ── Level 4 ──
pdf.section_title("Level 4: QFE Overlay")
pdf.sub_title("Question: Is the entry quality good right now?")
pdf.body_text(
    "Navigate to /prerun/qfe-daily. This overlays a Quality-Leadership-Entry-Market "
    "framework on top of all scanner results."
)

w = [30, 50, 110]
pdf.table_header(["Breadcrumb", "Column", "What You Want"], w)
pdf.table_row(["QFE Rating", "Rating badge", "A+ (90+) or A (80+) = top tier quality"], w)
pdf.table_row(["Action", "Action badge", "Buy Now or Buy Pullback (not Watchlist/Wait/Avoid)"], w)
pdf.table_row(["Quality", "Q (0-100)", "Market cap, volume, profitability. >=70 = institutional-grade"], w)
pdf.table_row(["Leadership", "L (0-100)", "Multi-TF RS vs SPY/QQQ/Sector. >=70 = clear leader"], w)
pdf.table_row(["Entry", "E (0-100)", "Distance from EMAs, pullback depth. >=70 = good entry"], w)
pdf.table_row(["Market Env", "M (0-100)", "SPY/QQQ trend, breadth, distribution. >=60 = supportive"], w)
pdf.table_row(["Risk Level", "Risk badge", "Low or Moderate (not High)"], w)
pdf.table_row(["Extension", "Extension badge", "Low = room to run. Extended = chase risk"], w)

pdf.ln(4)
pdf.warning_box("Kill switch: If Market Environment < 50 and Risk = High, the macro backdrop is hostile. Wait for improvement.")

# ── Level 5 ──
pdf.section_title("Level 5: Cross-Reference with Sectors")
pdf.sub_title("Question: Does sector rotation confirm this stock?")
pdf.body_text(
    "Navigate to /sectors/brief and /rotation to validate the stock's sector context."
)

w = [30, 50, 110]
pdf.table_header(["Check", "Where", "What You Want"], w)
pdf.table_row(["Sector Quadrant", "/sectors dashboard", "Stock's sector in LEADING or IMPROVING (not LAGGING)"], w)
pdf.table_row(["Sector Composite", "/sectors cards", ">=60 = actionable. >=40 = watchable"], w)
pdf.table_row(["Active Rotation", "/rotation tracker", "Sector has active rotation with ENTER or ADD signal"], w)
pdf.table_row(["Regime Alignment", "/sectors/brief", "Sector in regime's favored list"], w)
pdf.table_row(["Pre-Runner Radar", "/sectors/picks", "Stock also on Pre-Runner Radar = double confirmation"], w)

pdf.ln(4)
pdf.tip_box(
    "Highest conviction: A stock scoring KEEP/PRIORITY on Pre-Run + appearing on "
    "Pre-Runner Radar + in a LEADING sector with active EARLY rotation + regime aligned. "
    "This is the overlap where all systems agree."
)

# ── Companion Scanners ──
pdf.section_title("Companion Scanners")
pdf.body_text("Beyond the 5 presets, three specialized scanners run nightly on the same universe:")

w = [25, 45, 60, 60]
pdf.table_header(["Scanner", "Page", "What It Finds", "Best For"], w)
pdf.table_row(["VCP", "/prerun/vcp-daily", "Volatility contraction patterns (Minervini-style)", "Breakout traders, tight stops, defined risk"], w)
pdf.table_row(["Institutional", "/prerun/institutional-daily", "Large-cap RS acceleration ($20B+ names)", "Position traders, institutional flow"], w)
pdf.table_row(["Inflection", "/prerun/inflection-daily", "State transitions: seller exhaustion to buyer emergence", "Bottom fishers, catching the exact turn"], w)

# ── Quick Reference ──
pdf.section_title("Quick Reference: Daily Checklist")
pdf.body_text("Use this checklist each day to quickly identify the best setups:")

pdf.ln(2)
checks = [
    ("1.", "Check /prerun/preset-daily", "Any PRIORITY verdicts? (score >=19, earnings <=14 days)"),
    ("2.", "Pick the right preset", "Bull = Pullback/Leading. Recovery = SNDK/Early Mover. Quiet = Stealth"),
    ("3.", "Expand top scorers", "Which criteria clusters? Fundamental+Technical = best"),
    ("4.", "Check /prerun/qfe-daily", "Rating A/A+? Action = Buy Now? Entry >=70? Market Env >=60?"),
    ("5.", "Cross-ref /sectors", "Sector LEADING/IMPROVING? Active rotation? Regime aligned?"),
    ("6.", "Check streak + delta", "Streak >=3 days + positive delta = persistent, strengthening"),
]
w4 = [8, 50, 132]
pdf.table_header(["#", "Action", "What to Confirm"], w4)
for c in checks:
    pdf.table_row(list(c), w4)

pdf.ln(6)
pdf.warning_box(
    "Never buy if: Any gate fails (score=0), verdict=DISCARD, QFE action=Avoid, "
    "Market Env <50 + Risk=High, or sector in LAGGING quadrant with no rotation."
)

pdf.ln(4)
pdf.set_font("Helvetica", "I", 9)
pdf.set_text_color(150, 150, 150)
pdf.cell(0, 8, "Generated from QuantRadar Pre-Run Guide - quantradar.com/prerun/guide", align="C")

# ── Save ──
out = r"C:\Users\vkudu\claude-projects\ew-scanner\PreRun_Scanner_Framework.pdf"
pdf.output(out)
print(f"PDF saved to: {out}")
