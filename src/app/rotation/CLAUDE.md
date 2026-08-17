# Rotation Page (`/rotation`)

Loaded when working under `src/app/rotation/`.

Active rotation tracker with stock performance tables. Collapsible panels: Recently Ended, 12-Month Timeline, Pattern Statistics (collapsed by default). Compact regime pill (inline). Phase classification (`getRotationStockPhase`): turnaround uses `isTurnaroundCandidate`, below-50MA uses `trendAccel`, above-50MA uses `rsAcceleration` (stock vs sector ETF) instead of `trendAccel`. Sparkline: average-per-bin downsampling (50 max points). Exit warnings: non-overlapping 3-day windows (min 6 history entries for short path, 10 for full 5v5).
