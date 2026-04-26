import type { MetadataRoute } from "next";

const BASE = "https://ew-scanner.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE}/guide`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/learn`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/history`, changeFrequency: "daily", priority: 0.5 },
    { url: `${BASE}/watchlist`, changeFrequency: "daily", priority: 0.5 },
    { url: `${BASE}/squeeze`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/squeeze/guide`, changeFrequency: "weekly", priority: 0.7 },
    {
      url: `${BASE}/squeeze/watchlist`,
      changeFrequency: "daily",
      priority: 0.5,
    },
    { url: `${BASE}/prerun`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/prerun/guide`, changeFrequency: "weekly", priority: 0.7 },
    {
      url: `${BASE}/prerun/watchlist`,
      changeFrequency: "daily",
      priority: 0.5,
    },
    {
      url: `${BASE}/prerun/history`,
      changeFrequency: "daily",
      priority: 0.5,
    },
    { url: `${BASE}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/pricing`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/disclaimer`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
