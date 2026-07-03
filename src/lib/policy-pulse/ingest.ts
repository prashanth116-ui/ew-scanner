import "server-only";

import { createHash } from "crypto";
import { THEME_MAP } from "@/data/theme-map";
import { classifyArticle } from "./classify";
import { upsertThemeEvents, purgeOldThemeEvents } from "./persistence";
import type { RawArticle, ThemeEventRecord, IngestResult } from "./types";

/** Hash a URL for dedup. */
function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

/** Fetch general news from Finnhub. */
async function fetchFinnhubNews(): Promise<RawArticle[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn("[policy-pulse] FINNHUB_API_KEY not set, skipping Finnhub");
    return [];
  }

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${apiKey}`,
      { next: { revalidate: 0 } },
    );
    if (!res.ok) {
      console.error(`[policy-pulse] Finnhub fetch failed: ${res.status}`);
      return [];
    }

    const items: Array<{
      headline: string;
      summary: string;
      url: string;
      source: string;
      datetime: number;
    }> = await res.json();

    return items.map((item) => ({
      headline: item.headline,
      summary: item.summary?.slice(0, 500) ?? "",
      url: item.url,
      source: "finnhub",
      finnhubSource: item.source,
      datetime: item.datetime,
    }));
  } catch (err) {
    console.error("[policy-pulse] Finnhub fetch exception:", err);
    return [];
  }
}

/** Fetch White House RSS feed. */
async function fetchWhiteHouseRSS(): Promise<RawArticle[]> {
  try {
    const res = await fetch("https://www.whitehouse.gov/feed/", {
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      console.warn(`[policy-pulse] White House RSS fetch failed: ${res.status}`);
      return [];
    }

    const xml = await res.text();
    const articles: RawArticle[] = [];

    // Simple regex XML parsing — extract <item> blocks
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        ?? block.match(/<title>(.*?)<\/title>/)?.[1]
        ?? "";
      const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
      const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
      const desc =
        block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1]
        ?? block.match(/<description>([\s\S]*?)<\/description>/)?.[1]
        ?? "";

      if (!title || !link) continue;

      // Strip HTML from description
      const cleanDesc = desc.replace(/<[^>]+>/g, "").trim().slice(0, 500);

      const publishedDate = pubDate ? new Date(pubDate) : new Date();

      articles.push({
        headline: title.trim(),
        summary: cleanDesc,
        url: link.trim(),
        source: "whitehouse-rss",
        datetime: Math.floor(publishedDate.getTime() / 1000),
        publishedAt: publishedDate.toISOString(),
      });
    }

    return articles;
  } catch (err) {
    console.error("[policy-pulse] White House RSS exception:", err);
    return [];
  }
}

/**
 * Main ingestion pipeline:
 * 1. Fetch Finnhub + White House RSS
 * 2. Deduplicate by URL hash
 * 3. Classify against 15 themes
 * 4. Persist matches
 * 5. Purge old data
 */
export async function ingestPolicyPulse(): Promise<IngestResult> {
  // 1. Fetch from both sources in parallel
  const [finnhubArticles, whiteHouseArticles] = await Promise.all([
    fetchFinnhubNews(),
    fetchWhiteHouseRSS(),
  ]);

  // 2. Merge and deduplicate by URL hash
  const allArticles = [...finnhubArticles, ...whiteHouseArticles];
  const seen = new Set<string>();
  const dedupedArticles: Array<RawArticle & { urlHash: string }> = [];

  for (const article of allArticles) {
    const hash = hashUrl(article.url);
    if (seen.has(hash)) continue;
    seen.add(hash);
    dedupedArticles.push({ ...article, urlHash: hash });
  }

  // 3. Classify each article
  const records: ThemeEventRecord[] = [];
  const themeCounts: Record<string, number> = {};

  const whiteHouseTheme = THEME_MAP.find((t) => t.id === "white-house");

  for (const article of dedupedArticles) {
    const classifications = classifyArticle(article, THEME_MAP);

    // Auto-tag all White House RSS articles under the white-house theme
    if (
      article.source === "whitehouse-rss" &&
      whiteHouseTheme &&
      !classifications.some((c) => c.themeId === "white-house")
    ) {
      classifications.push({
        themeId: "white-house",
        impactScore: 70,
        matchedKeywords: ["whitehouse-rss-source"],
        strongMatch: true,
      });
    }

    for (const classification of classifications) {
      // Only persist high-impact events
      if (classification.impactScore < 40) continue;

      const theme = THEME_MAP.find((t) => t.id === classification.themeId);
      if (!theme) continue;

      const publishedAt = article.publishedAt
        ?? new Date(article.datetime * 1000).toISOString();

      records.push({
        url_hash: article.urlHash,
        theme_id: classification.themeId,
        headline: article.headline.slice(0, 500),
        summary: article.summary?.slice(0, 500) ?? null,
        source: article.source,
        source_url: article.url,
        published_at: publishedAt,
        impact_score: classification.impactScore,
        impacted_tickers: theme.tickers,
        impacted_etfs: theme.etfs,
      });

      themeCounts[classification.themeId] =
        (themeCounts[classification.themeId] ?? 0) + 1;
    }
  }

  // 4. Persist
  const persisted = await upsertThemeEvents(records);

  // 5. Purge old data (keep 30 days)
  await purgeOldThemeEvents(30);

  return {
    total: dedupedArticles.length,
    classified: records.length,
    persisted,
    themes: themeCounts,
  };
}
