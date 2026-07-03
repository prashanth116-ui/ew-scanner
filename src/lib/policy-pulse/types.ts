export interface ThemeDefinition {
  id: string;
  label: string;
  keywords: string[];
  strongKeywords: string[];
  tickers: string[];
  etfs: string[];
  sourceWeight?: Record<string, number>;
}

export interface ThemeEvent {
  id: number;
  urlHash: string;
  themeId: string;
  themeName: string;
  headline: string;
  summary: string | null;
  source: string;
  sourceUrl: string | null;
  publishedAt: string;
  ingestedAt: string;
  impactScore: number;
  impactedTickers: string[];
  impactedEtfs: string[];
  expired: boolean;
}

export interface ThemeEventWithCrossRef extends ThemeEvent {
  scannerData: ScannerCrossRef[];
}

export interface ScannerCrossRef {
  ticker: string;
  qfeRating?: string;
  qfeScore?: number;
  prerunVerdict?: string;
  prerunScore?: number;
}

export interface RawArticle {
  headline: string;
  summary: string;
  url: string;
  source: string;
  finnhubSource?: string;
  datetime: number;
  publishedAt?: string;
}

export interface ThemeEventRecord {
  url_hash: string;
  theme_id: string;
  headline: string;
  summary: string | null;
  source: string;
  source_url: string | null;
  published_at: string;
  impact_score: number;
  impacted_tickers: string[];
  impacted_etfs: string[];
}

export interface ClassifiedResult {
  themeId: string;
  impactScore: number;
  matchedKeywords: string[];
  strongMatch: boolean;
}

export interface IngestResult {
  total: number;
  classified: number;
  persisted: number;
  themes: Record<string, number>;
}
