"""Generate Scanner & Preset Power Ranking PDF report."""

from fpdf import FPDF
import os
import subprocess
import sys


class Report(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(100, 100, 100)
        self.cell(0, 6, "QuantRadar  |  Scanner & Preset Power Ranking", align="R")
        self.ln(8)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def section_title(self, title: str):
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(30, 30, 30)
        self.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
        self.set_draw_color(50, 120, 200)
        self.set_line_width(0.6)
        self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
        self.ln(4)

    def sub_title(self, title: str):
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(50, 50, 50)
        self.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def body_text(self, text: str):
        self.set_font("Helvetica", "", 9.5)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5, text)
        self.ln(2)

    def bold_text(self, text: str):
        self.set_font("Helvetica", "B", 9.5)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5, text)
        self.ln(1)

    def bullet(self, text: str, indent: int = 10):
        x = self.get_x()
        self.set_font("Helvetica", "", 9.5)
        self.set_text_color(40, 40, 40)
        self.set_x(x + indent)
        self.cell(4, 5, "-")
        self.multi_cell(0, 5, text)
        self.ln(1)

    def add_table(self, headers: list[str], rows: list[list[str]], col_widths: list[float]):
        # Header row
        self.set_font("Helvetica", "B", 8)
        self.set_fill_color(40, 40, 50)
        self.set_text_color(255, 255, 255)
        for i, h in enumerate(headers):
            self.cell(col_widths[i], 7, h, border=1, fill=True, align="C")
        self.ln()
        # Data rows
        self.set_font("Helvetica", "", 8)
        self.set_text_color(30, 30, 30)
        for row_idx, row in enumerate(rows):
            fill = row_idx % 2 == 0
            if fill:
                self.set_fill_color(245, 245, 250)
            else:
                self.set_fill_color(255, 255, 255)
            for i, val in enumerate(row):
                align = "L" if i == 0 else "C"
                self.cell(col_widths[i], 6, val, border=1, fill=True, align=align)
            self.ln()
        self.ln(3)


def build_report():
    pdf = Report()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Title
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(0, 12, "Scanner & Preset Power Ranking", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 8, "Live Production Data  |  7-Day Hit Rates  |  June 19, 2026", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # ── Hit Rate Table ──
    pdf.section_title("Live Hit Rate Data (7-Day, Latest June 19, 2026)")

    headers = ["Rank", "Scanner / Mode", "Hit Rate", "Avg Ret", "Avg DD", "N", "Verdict"]
    widths = [12, 52, 18, 18, 18, 14, 58]
    rows = [
        ["1", "EW Wave4 / High", "71.4%", "+2.47%", "-0.81%", "70", "Best in class"],
        ["2", "EW Wave4 / Probable", "58.8%", "+1.94%", "-2.18%", "17", "Strong"],
        ["3", "PreRun / DISCARD", "54.7%", "+1.02%", "-3.13%", "106", "See note below"],
        ["4", "EW Breakout / Probable", "53.2%", "-0.79%", "-3.07%", "109", "Marginal"],
        ["5", "EW Wave2 / Probable", "52.2%", "-0.01%", "-2.03%", "23", "Breakeven"],
        ["6", "EW Wave2 / High", "52.1%", "-0.93%", "-3.11%", "119", "Marginal"],
        ["7", "EW Wave5 / Probable", "50.0%", "-0.09%", "-4.19%", "38", "Coin flip"],
        ["8", "EW Wave5 / High", "49.4%", "-0.55%", "-2.53%", "81", "Coin flip"],
        ["9", "Confluence / Moderate", "44.4%", "-0.74%", "-3.64%", "478", "Below break-even"],
        ["10", "EW Breakout / High", "44.7%", "-2.00%", "-4.56%", "38", "Losing"],
        ["11", "PreRun / WATCH", "37.0%", "-3.11%", "-5.59%", "165", "Losing"],
        ["12", "Confluence / Strong", "36.4%", "-0.97%", "-2.62%", "22", "Losing"],
        ["13", "PreRun / PRIORITY", "25.0%", "-4.44%", "-8.21%", "72", "Bad"],
        ["14", "PreRun / KEEP", "24.5%", "-6.33%", "-7.35%", "110", "Bad"],
        ["15", "Squeeze / Medium", "16.7%", "-7.00%", "-7.44%", "30", "Worst"],
        ["--", "Catalyst", "N/A", "--", "--", "0", "Too new"],
    ]
    pdf.add_table(headers, rows, widths)

    # ── Key Findings ──
    pdf.section_title("Key Findings")

    pdf.bold_text("1. EW Wave4 is the only consistently profitable signal in the system.")
    pdf.body_text(
        "Wave4 / High confidence: 71.4% hit rate, +2.47% avg return over 7 days, "
        "with only -0.81% avg drawdown. Statistically significant at n=70. "
        "Wave4 / Probable also works at 58.8% / +1.94%.\n\n"
        "Why it works: Wave 4 corrections in an established uptrend are mean-reverting. "
        "You're buying a pullback within a confirmed trend. The Elliott Wave structure "
        "gives you a structural invalidation level (below wave 1), so risk is well-defined."
    )

    pdf.bold_text("2. The PreRun scanner has an inverted scoring problem.")
    pdf.body_text(
        "DISCARD (54.7%, +1.02%) outperforms PRIORITY (25.0%, -4.44%) and KEEP (24.5%, -6.33%). "
        "The stocks PreRun rates highest are actually the worst 7-day performers. This makes "
        "structural sense: PreRun selects stocks 20%+ from ATH with high short interest -"
        "beaten-down names that tend to keep falling short-term. The system is designed for "
        "multi-week/month swing setups, so the 7-day window may be too short for its thesis. "
        "Still, the inversion is a warning sign."
    )

    pdf.bold_text("3. Squeeze scanner is the worst performer.")
    pdf.body_text(
        "16.7% hit rate with -7% avg return. Only 30 medium-tier signals tracked (no high-tier "
        "signals reached n=5). Short squeeze setups are inherently low-probability/high-reward, "
        "but the data shows the 'high-reward' part isn't materializing either."
    )

    pdf.bold_text("4. Confluence is mediocre despite being the most complex.")
    pdf.body_text(
        "Moderate: 44.4% on 478 signals, but -0.74% avg return. Strong: 36.4% on 22 signals. "
        "The weighted blend averages out signal quality rather than amplifying it. Notably, "
        "'strong' signals (4+ scanners passing) perform worse than 'moderate' -over-filtering "
        "doesn't improve quality."
    )

    pdf.bold_text("5. EW is the only scanner with positive average returns.")
    pdf.body_text(
        "Wave4 High (+2.47%), Wave4 Probable (+1.94%), and Wave5 Speculative (+4.38%, n=6 only) "
        "are the only modes showing positive avg returns across the entire system."
    )

    # ── Tier Ranking ──
    pdf.add_page()
    pdf.section_title("Scanner Tier Ranking")

    pdf.sub_title("Tier S -Proven Profitable")
    pdf.bullet("EW Wave4 -71.4% hit rate, positive returns, shallow drawdowns. Primary signal generator.")

    pdf.sub_title("Tier A -Useful with Filters")
    pdf.bullet("EW Wave2 / Probable -52.2% hit rate, near-zero returns. Needs sector momentum + M2 timing.")
    pdf.bullet("Confluence / Moderate -44.4% on large sample. Better as sector screener than direct trade signal.")

    pdf.sub_title("Tier B -Supplementary / Research")
    pdf.bullet("PreRun / WATCH -37.0% for 7-day, designed for longer holds. Use as watchlist builder.")
    pdf.bullet("EW Wave5 -49-50% hit rate. For identifying tops and hedging, not directional trades.")
    pdf.bullet("EW Breakout -Mixed. Probable (53.2%) marginal; High (44.7%) negative. Chasing breakouts is noisy.")

    pdf.sub_title("Tier C -Avoid or Redesign")
    pdf.bullet("PreRun / PRIORITY & KEEP -Inverse performance. Higher scores = worse outcomes.")
    pdf.bullet("Squeeze -16.7% hit rate. Thesis valid but execution needs work.")
    pdf.bullet("Catalyst -No data yet, unproven.")

    # ── Recommended Workflow ──
    pdf.add_page()
    pdf.section_title("Recommended Daily Workflow Sequence")

    steps = [
        ("STEP 1: Sector Rotation (/sectors)", "Sunday evening or pre-market",
         "Identify LEADING/IMPROVING sectors. Note which sectors are in favorable RRG quadrants. "
         "This filters the universe for Steps 2-5."),
        ("STEP 2: QuantRadar -Wave4 mode", "PRIMARY signal generator",
         "71.4% hit rate. Filter to High confidence only, focus on LEADING sectors from Step 1. "
         "These are your direct trades. Set entry, stop, and targets from Elliott Wave structure."),
        ("STEP 3: QuantRadar -Wave2 mode", "SECONDARY signals",
         "52.2% hit rate. Probable+ confidence, cross-reference with sector momentum. "
         "Smaller position sizes, wider stops than Wave4 trades."),
        ("STEP 4: Confluence Scanner -Moderate+", "Validation layer",
         "Use 'Max Conviction' preset (fewest results, highest quality). If your EW pick also "
         "shows up here with 3+ scanners passing, increase conviction and position size."),
        ("STEP 5: PreRun Scanner -Watchlist building", "1-2 week forward pipeline",
         "Use 'Leading Sector Scan' or 'Aggressive Early' preset with Top Picks toggle. "
         "Add to watchlist. Do NOT trade immediately. Wait for EW Wave4 signal on these names later."),
        ("STEP 6: Catalyst Scanner", "Event timing",
         "Identify upcoming earnings/event catalysts. Cross-reference with PreRun watchlist "
         "for timing alignment. Helps you know WHEN to watch for Wave4 setups."),
        ("SKIP: Squeeze Scanner", "16.7% hit rate, -7% avg return",
         "Not worth scanning until the scoring model is redesigned."),
    ]

    for title, timing, desc in steps:
        pdf.bold_text(title)
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(80, 80, 80)
        pdf.cell(0, 5, timing, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(1)
        pdf.body_text(desc)

    # ── Preset Recommendations ──
    pdf.add_page()
    pdf.section_title("Preset Recommendations by Scanner")

    pdf.sub_title("QuantRadar Modes")
    pdf.bullet("Wave4 -USE EXCLUSIVELY for trades (71.4% win rate, +2.47% avg return)")
    pdf.bullet("Wave2 -Secondary signal (52% win rate, needs additional confirmation)")
    pdf.bullet("Breakout -Skip (noisy, negative returns on high confidence)")
    pdf.bullet("Wave5 -Bearish hedging ideas only, not directional trades")

    pdf.sub_title("PreRun Presets (for watchlist building, NOT direct trades)")
    pdf.bullet("Leading Sector Scan -Best structural preset, aligns with sector momentum")
    pdf.bullet("Aggressive Early -Catches setups earliest, low threshold = more noise")
    pdf.bullet("Early Mover -Stricter (M2 + L + F required), fewer but cleaner results")
    pdf.bullet("Stealth Accumulation -OBV/VP divergence is strong but needs time")
    pdf.bullet("SNDK Pattern -High conviction but extremely narrow (40% ATH + 15% SI)")
    pdf.bullet("Inst. VCP Breakout -No hit rate data (VCP signals not tracked separately)")
    pdf.bullet("Pullback Buy -Reasonable thesis but no data to validate")

    pdf.sub_title("Confluence Presets")
    pdf.bullet("Max Conviction -Recommended. Fewest results, 4+ scanners must agree.")
    pdf.bullet("Wide Net -Only for initial screening when markets are quiet.")
    pdf.bullet("Others -Skip until confluence hit rates improve above 50%.")

    # ── Bottom Line ──
    pdf.ln(4)
    pdf.section_title("Bottom Line")
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(20, 80, 20)
    pdf.multi_cell(0, 6,
        "EW Wave4 / High confidence is your edge. Everything else is either supplementary "
        "context or underperforming. The data says: find Wave 4 pullbacks in leading sectors, "
        "enter at high confidence, and manage risk tightly (-0.81% avg drawdown means these "
        "setups don't go far against you before working)."
    )
    pdf.ln(4)

    # ── Data Methodology ──
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(130, 130, 130)
    pdf.multi_cell(0, 4,
        "Methodology: Hit rates computed nightly from live signal tracking via Supabase. "
        "7-day forward returns measured from signal date. Direction-aware scoring (bearish "
        "signals scored on negative returns). Minimum 5 signals required per mode/strength "
        "group. Data covers May-June 2026 trading period. All returns are raw (not risk-adjusted)."
    )

    # Save
    out_path = os.path.join(os.path.dirname(__file__), "Scanner_Power_Ranking.pdf")
    pdf.output(out_path)
    return out_path


if __name__ == "__main__":
    path = build_report()
    print(f"Report saved to: {path}")
    # Open the PDF
    if sys.platform == "win32":
        os.startfile(path)
    elif sys.platform == "darwin":
        subprocess.run(["open", path])
    else:
        subprocess.run(["xdg-open", path])
