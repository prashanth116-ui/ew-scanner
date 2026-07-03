import type { RawArticle, ClassifiedResult, ThemeDefinition } from "./types";

/** Source authority scores (out of 25). */
const SOURCE_AUTHORITY: Record<string, number> = {
  "whitehouse-rss": 25,
  "fed-register": 23,
};

/** Known high-authority Finnhub sub-sources. */
const HIGH_AUTHORITY_SOURCES = new Set([
  "reuters", "associated press", "ap", "wall street journal", "wsj",
  "bloomberg", "cnbc", "financial times", "ft", "nytimes", "new york times",
]);

function getSourceAuthority(source: string, finnhubSource?: string): number {
  if (SOURCE_AUTHORITY[source]) return SOURCE_AUTHORITY[source];
  const sub = (finnhubSource ?? "").toLowerCase();
  if (HIGH_AUTHORITY_SOURCES.has(sub)) return 20;
  return 10;
}

/** Count keyword matches in text, returning matched keywords. */
function matchKeywords(text: string, keywords: string[]): string[] {
  const matched: string[] = [];
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) {
      matched.push(kw);
    }
  }
  return matched;
}

/**
 * Classify an article against all themes.
 * Returns all matching themes (an article can match multiple themes).
 */
export function classifyArticle(
  article: RawArticle,
  themes: ThemeDefinition[],
): ClassifiedResult[] {
  const headlineLower = article.headline.toLowerCase();
  const summaryLower = (article.summary ?? "").toLowerCase();
  const combined = `${headlineLower} ${summaryLower}`;

  const results: ClassifiedResult[] = [];

  for (const theme of themes) {
    const strongMatches = matchKeywords(combined, theme.strongKeywords);
    const regularMatches = matchKeywords(combined, theme.keywords);
    const allMatched = [...new Set([...strongMatches, ...regularMatches])];

    // Fire if: any strong keyword matches OR 2+ regular keywords match
    const fires = strongMatches.length > 0 || regularMatches.length >= 2;
    if (!fires) continue;

    const impactScore = computeImpactScore(
      article,
      headlineLower,
      theme,
      strongMatches,
      allMatched,
    );

    results.push({
      themeId: theme.id,
      impactScore,
      matchedKeywords: allMatched,
      strongMatch: strongMatches.length > 0,
    });
  }

  return results;
}

/**
 * Compute impact score (0-100) based on:
 * - Source authority (25)
 * - Keyword density (25)
 * - Strong keyword bonus (15)
 * - Headline match (15)
 * - Multi-keyword bonus (20)
 */
function computeImpactScore(
  article: RawArticle,
  headlineLower: string,
  theme: ThemeDefinition,
  strongMatches: string[],
  allMatched: string[],
): number {
  let score = 0;

  // 1. Source authority (0-25)
  const sourceWeight = theme.sourceWeight?.[article.source];
  score += sourceWeight ?? getSourceAuthority(article.source, article.finnhubSource);

  // 2. Keyword density (0-25)
  const combined = `${article.headline} ${article.summary ?? ""}`;
  const totalWords = combined.split(/\s+/).length;
  const density = totalWords > 0 ? allMatched.length / totalWords : 0;
  score += Math.min(25, Math.round(density * 500));

  // 3. Strong keyword bonus (0-15)
  if (strongMatches.length > 0) {
    const headlineStrong = strongMatches.some((kw) =>
      headlineLower.includes(kw.toLowerCase()),
    );
    score += headlineStrong ? 15 : 10;
  }

  // 4. Headline match (0-15)
  const allKeywords = [...theme.strongKeywords, ...theme.keywords];
  const headlineMatch = allKeywords.some((kw) =>
    headlineLower.includes(kw.toLowerCase()),
  );
  score += headlineMatch ? 15 : 5;

  // 5. Multi-keyword bonus (0-20) — rewards articles hitting multiple keywords
  if (allMatched.length >= 4) score += 20;
  else if (allMatched.length >= 3) score += 15;
  else if (allMatched.length >= 2) score += 8;

  return Math.min(100, Math.max(0, score));
}
