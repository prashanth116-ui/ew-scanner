"""Generate Top-Down Analysis Framework PDF."""
from fpdf import FPDF

class PDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, "QuantRadar - Top-Down Analysis Framework", align="R")
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
        self.rect(10, y, 190, h, "DF")
        self.set_xy(12, y + 3)
        self.multi_cell(186, 4, text)
        self.set_y(y + h + 4)

    def table_header(self, cols, widths):
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
        # Calculate row height using the PADDED width (same as actual render)
        for i, col in enumerate(cols):
            lines = self.multi_cell(widths[i] - 2, 4, col, dry_run=True, output="LINES")
            h = len(lines) * 5 + 2
            if h > max_h:
                max_h = h
        # Check if we need a page break before this row
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
pdf.cell(0, 15, "Top-Down Analysis", align="C")
pdf.ln(15)
pdf.cell(0, 15, "Framework", align="C")
pdf.ln(20)
pdf.set_font("Helvetica", "", 14)
pdf.set_text_color(100, 100, 100)
pdf.cell(0, 10, "How to Spot Runners Before They Move", align="C")
pdf.ln(15)
pdf.set_font("Helvetica", "", 11)
pdf.cell(0, 8, "QuantRadar - Sector Rotation System", align="C")
pdf.ln(8)
pdf.cell(0, 8, "quantradar.com/sectors", align="C")
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
    "The system is a funnel - wide at the top (macro), narrow at the bottom (individual stocks). "
    "Each level narrows your focus so you only spend time on the highest-conviction setups. "
    "Follow these breadcrumbs in order."
)
pdf.body_text(
    "The approach works top-down through four levels: Macro Regime, Sector Selection, "
    "Rotation Confirmation, and Stock Selection. At each level, specific breadcrumbs tell you "
    "whether to continue deeper or stop."
)

pdf.ln(4)
pdf.bold_text("The Four Levels:")
pdf.bullet("Level 1: Macro Regime (/sectors/brief) - Is the environment favorable?")
pdf.bullet("Level 2: Sector Selection (/sectors) - Which sectors are rotating in?")
pdf.bullet("Level 3: Rotation Confirmation (/rotation) - Is this a real rotation or noise?")
pdf.bullet("Level 4: Stock Selection (/sectors/picks) - Which stocks will move most?")

# ── Level 1 ──
pdf.section_title("Level 1: Macro Regime")
pdf.sub_title("Question: Is the environment favorable?")
pdf.body_text("Navigate to /sectors/brief. This page gives you the macro context for everything below.")

w = [35, 60, 95]
pdf.table_header(["Breadcrumb", "Where to Look", "What You Want"], w)
pdf.table_row(["Regime", "Brief > Pre-Market Pulse", "RISK_ON or MIXED (not RISK_OFF)"], w)
pdf.table_row(["VIX", "Brief > Pre-Market Pulse", "Below adaptive upper bound, stable or declining"], w)
pdf.table_row(["Trading Bias", "Brief > Trading Bias Card", "Lean Bull or Strong Bull, confidence >60%"], w)
pdf.table_row(["Posture", "Brief > Posture Banner", "AGGRESSIVE or ACTIVE (not DEFENSIVE/CASH)"], w)
pdf.table_row(["Risk Flags", "Brief > Risk Flags Panel", "Fewer than 2 high-severity flags"], w)

pdf.ln(4)
pdf.warning_box("STOP: If regime is RISK_OFF + DEFENSIVE posture + 3+ risk flags -> no runners in this environment.")

# ── Level 2 ──
pdf.section_title("Level 2: Sector Selection")
pdf.sub_title("Question: Which sectors are rotating in?")
pdf.body_text("Navigate to /sectors (main dashboard). Identify which sectors have institutional money flowing in.")

w = [38, 62, 90]
pdf.table_header(["Breadcrumb", "Where to Look", "What You Want"], w)
pdf.table_row(["Quadrant", "Dashboard > RRG Chart", "Sectors in IMPROVING quadrant (moving toward LEADING)"], w)
pdf.table_row(["Acceleration", "Dashboard > Sector Cards", "Positive and rising - the rate of change of momentum"], w)
pdf.table_row(["Stealth Badge", "Dashboard > Sector Cards", "Green 'stealth' badge = accumulation before breakout"], w)
pdf.table_row(["CMF", "Dashboard > Sector Detail", "Positive (>0) = institutional inflow, >0.10 = strong"], w)
pdf.table_row(["Dispersion", "Dashboard > Summary Strip", "Rising = rotations happening, not a flat market"], w)
pdf.table_row(["Sub-sector", "Brief > Sub-Sector Div.", "Sub-sector leading parent = early signal (e.g., XBI > XLV)"], w)

pdf.ln(4)
pdf.tip_box("The ideal sector: IMPROVING quadrant + acceleration >1.0 + CMF >0 + stealth badge. This was Biotech (XBI) when it caught SEER.")

# ── Level 3 ──
pdf.section_title("Level 3: Rotation Confirmation")
pdf.sub_title("Question: Is this a real rotation or noise?")
pdf.body_text("Navigate to /rotation. Verify the sector rotation is genuine and tradeable.")

w = [38, 62, 90]
pdf.table_header(["Breadcrumb", "Where to Look", "What You Want"], w)
pdf.table_row(["Lifecycle Stage", "Rotation Tracker > Active", "EARLY (<=5 days) = prime entry window"], w)
pdf.table_row(["Conviction", "Rotation Tracker > Badge", "HIGH (>=6) or MODERATE (>=3)"], w)
pdf.table_row(["Signal Count", "Rotation Tracker > Sparkline", "2+ of 3 signals (RS golden cross, vol surge, >50MA)"], w)
pdf.table_row(["Regime Align", "Rotation Tracker > Badge", "Green 'Aligned' = regime favors this sector"], w)
pdf.table_row(["Action Signal", "Rotation Tracker > Badge", "ENTER (green) or ADD ON PULLBACK (cyan)"], w)
pdf.table_row(["Signal Trend", "Rotation Tracker > Sparkline", "Stable or improving over last 3 days, not declining"], w)

pdf.ln(4)
pdf.warning_box("KILL SWITCH: Lifecycle=LATE/EXHAUSTING, conviction=LOW/EXIT, action=HOLD/EXIT -> you missed it, move on.")

# ── Level 4 ──
pdf.section_title("Level 4: Stock Selection")
pdf.sub_title("Question: Which stocks in this sector will move most?")
pdf.body_text("Navigate to /sectors/picks. This page combines all upstream data into actionable stock picks.")

w = [38, 60, 92]
pdf.table_header(["Breadcrumb", "Where to Look", "What You Want"], w)
pdf.table_row(["Entry Signals", "Picks > top of page", "Stocks passing ALL 4 gates (ENTER, CMF>0, accel>0, quality)"], w)
pdf.table_row(["Pre-Runner Radar", "Picks > below Entry Signals", "Turnarounds + Leaders scored 0-100 by RS accel"], w)
pdf.table_row(["RS Acceleration", "Picks > Radar table", "High positive = catching up fast. SEER had 24.29"], w)
pdf.table_row(["Conviction", "Picks > badge color", "GREEN (HIGH) or CYAN (MEDIUM)"], w)
pdf.table_row(["Phase", "Picks > Stock Picks table", "P2_TURNAROUND = inflection. P3_TRENDING = uptrend"], w)
pdf.table_row(["Volume Ratio", "Picks > table", ">=1.2x = confirming. >=1.5x = strong institutional"], w)
pdf.table_row(["Top Picks", "Picks > grouped section", "Pre-ranked top 3 per sector by conviction, RS accel"], w)

# ── SEER Case Study ──
pdf.section_title("Case Study: The SEER Playbook")
pdf.body_text(
    "SEER spiked after-hours on July 2, 2026. Working backwards from the data, "
    "here's what the breadcrumbs looked like before the move:"
)
pdf.ln(2)

pdf.bold_text("1. Macro: Regime favorable")
pdf.body_text("Biotech was listed in the regime's favored sectors. Posture was ACTIVE. No kill signals.")

pdf.bold_text("2. Sector: XBI in LEADING quadrant")
pdf.body_text("Acceleration: 10.84 (strong). CMF positive. The sector was running.")

pdf.bold_text("3. Rotation: Biotech rotation active")
pdf.body_text("SEER flagged as turnaround candidate in the stock table within the active biotech rotation.")

pdf.bold_text("4. Stock: Extreme RS acceleration")
pdf.body_text(
    "RS Acceleration: 24.29 (very high). RS Improving: true. RS Delta: +11.24. "
    "Below 50MA. Turnaround candidate: true. Volume consistency: 1."
)

pdf.ln(4)
pdf.tip_box(
    'The signal: "Below-50MA stock in a leading sector with the highest RS acceleration in the group." '
    "That's the catch-up play - when the sector is running and a laggard starts showing relative strength, "
    "it often snaps violently. The Pre-Runner Radar now automates this exact pattern detection."
)

# ── Pre-Runner Radar ──
pdf.section_title("Pre-Runner Radar (Automated)")
pdf.body_text(
    "The Pre-Runner Radar automates the Level 4 stock selection. It runs two independent pipelines "
    "and merges the results into a single scored list:"
)

pdf.ln(2)
pdf.bold_text("Pipeline 1: Turnarounds (from Rotation Tracker)")
pdf.bullet("Source: Stocks flagged as turnaround candidates in active rotations")
pdf.bullet("No quality gates - catches small caps, biotech, pre-revenue names")
pdf.bullet("Scoring: RS Accel 40%, Lifecycle 20%, Volume 15%, Sector 15%, Regime 10%")

pdf.ln(2)
pdf.bold_text("Pipeline 2: Leaders (from Enrichment Pipeline)")
pdf.bullet("Source: Quality-gated stocks classified as LEADER with HIGH/MEDIUM conviction")
pdf.bullet("Gates: $2B+ market cap, 30%+ institutional ownership, 1M+ avg volume")
pdf.bullet("Scoring: RS Accel 35%, Sector 25%, Volume 15%, Conviction 15%, Regime 10%")

pdf.ln(2)
pdf.bold_text("Why Two Pipelines?")
pdf.body_text(
    "A stock like SEER ($500M market cap, minimal institutional ownership) would fail every quality "
    "gate. But the rotation tracker doesn't care about fundamentals - it just sees RS acceleration + "
    "volume. Meanwhile, large-cap leaders like PATH come through the enrichment pipeline. "
    "Both belong on the same watchlist."
)

pdf.ln(2)
pdf.bold_text("Nightly Alerts")
pdf.body_text(
    "A cron job runs at 10:50 PM ET every weekday. It computes the radar, persists results to the "
    "database (14-day retention), compares against yesterday's list to identify new additions and exits, "
    "and sends a Telegram summary with the top 5 candidates."
)

# ── Interpreting RS ──
pdf.section_title("Interpreting Sector RS Numbers")
pdf.body_text("Sector RS values outside +/-5 deserve extra attention:")
pdf.ln(2)

pdf.bold_text("RS > +5 with negative % Change")
pdf.body_text("Strong turnaround signal. The stock is reversing hard and fast from deep underperformance.")

pdf.bold_text("RS > +5 with positive % Change")
pdf.body_text("Momentum acceleration. Already outperforming and gaining more ground. Leader getting stronger.")

pdf.bold_text("RS < -5 with positive % Change")
pdf.body_text("Post-spike cooldown. Check for recent earnings gap or catalyst. Usually not a sell signal.")

pdf.bold_text("RS < -5 with negative % Change")
pdf.body_text("Deteriorating laggard. The worst combination. Stock is underperforming and getting worse. Avoid.")

pdf.ln(6)
pdf.tip_box(
    "The highest-conviction setup: an ENTER sector with Regime Aligned badge, containing turnaround "
    "candidates with Sector RS > +5 on the Pre-Runner Radar. This means fresh rotation + macro tailwind "
    "+ lagging stock reversing with institutional volume - the exact SEER pattern."
)

# ── Quick Reference ──
pdf.section_title("Quick Reference: Daily Checklist")
pdf.body_text("Use this checklist each day to quickly identify the best setups:")

pdf.ln(2)
checks = [
    ("1.", "Check /sectors/brief", "Regime = RISK_ON or MIXED? Posture = AGGRESSIVE/ACTIVE? <2 risk flags?"),
    ("2.", "Check /sectors dashboard", "Any sectors IMPROVING with acceleration >1.0 and CMF >0?"),
    ("3.", "Check /rotation", "Active rotations with EARLY lifecycle, HIGH conviction, ENTER signal?"),
    ("4.", "Check /sectors/picks", "Entry Signals panel showing entries? Pre-Runner Radar has candidates?"),
    ("5.", "Focus on top candidates", "Highest RS Accel + improving + volume >=1.2x = your watchlist"),
]
w2 = [8, 50, 132]
pdf.table_header(["#", "Action", "What to Confirm"], w2)
for c in checks:
    pdf.table_row(list(c), w2)

pdf.ln(6)
pdf.warning_box("Never enter if: Regime=RISK_OFF + DEFENSIVE, or rotation lifecycle=LATE/EXHAUSTING, or conviction=EXIT")

pdf.ln(4)
pdf.set_font("Helvetica", "I", 9)
pdf.set_text_color(150, 150, 150)
pdf.cell(0, 8, "Generated from QuantRadar Sector Rotation Guide - quantradar.com/sectors/guide", align="C")

# ── Save ──
out = r"C:\Users\vkudu\claude-projects\ew-scanner\TopDown_Analysis_Framework_v3.pdf"
pdf.output(out)
print(f"PDF saved to: {out}")
