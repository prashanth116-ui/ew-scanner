// Barrel re-exports — preserves all existing import paths from "./_components" and "../_components"

// Types
export type { TradingAction, SortMode, SmaFilter, VolFilter, VerdictFilter, RsAccelFilter, PhaseFilter, PicksSortKey, PullbackSortKey, StockInSector, SectorAlert } from "./types";

// Constants
export {
  COLLAPSED_KEY,
  COMPOSITE_TRADE_THRESHOLD,
  COMPOSITE_WATCH_THRESHOLD,
  ALERT_STORAGE_KEY,
  LOADING_PHASES,
  LOADING_TIMEOUT_MS,
  LOADING_PHASE_INTERVAL_MS,
  SORT_MODE_OPTIONS,
  ACTION_RANK,
  QUADRANT_RANK,
  CONVICTION_STYLE,
  CATEGORY_STYLE,
  CONV_ORDER,
  CAT_ORDER,
  PHASE_ORDER,
  TIER_ORDER,
  TIER_STYLE,
  VERDICT_RANK,
} from "./constants";

// Helpers
export {
  quadrantColor,
  quadrantDotColor,
  getTradingAction,
  actionBadge,
  actionBorderColor,
  getStockPhase,
  getEntryQuality,
  rsColor,
  rsAccelColor,
} from "./helpers";

// Shared components & hooks
export {
  SectorNav,
  Sparkline,
  useCollapsedPanels,
  CollapsiblePanel,
  EtfSparkline,
  DataStalenessWarning,
} from "./shared";

// Component modules
export { RegimeBanner } from "./regime-banner";
export { TradingActionBadge, ComparisonDelta } from "./comparison-delta";
export { RRGChart } from "./rrg-chart";
export { AlertPanel, loadAlerts, saveAlerts } from "./alerts";
export { StockSearch } from "./stock-search";
export { CorrelationMatrix, SectorComparison, SubSectorPanel, CrossAssetPanel, LeadershipBasketsPanel } from "./panels";
export { SectorStockTable, FilterRecipes } from "./sector-stock-table";
export { SectorDetail } from "./sector-detail";
export { StockPicksPanel, TopPicksBySector } from "./stock-picks-panel";
export { PullbackWatchPanel } from "./pullback-panel";
export { RotationEntrySignals } from "./entry-signals";
export { PreRunnerRadar } from "./prerunner-radar";
export { SectorCard, ExpandedStockTable } from "./sector-card";
export { HistoryChart } from "./history-chart";
export { SummaryStrip } from "./summary-strip";
export { ActionSummary } from "./action-summary";
export { InfoTip } from "./info-tip";
