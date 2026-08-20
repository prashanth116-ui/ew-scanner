import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ICT Guide",
  description:
    "ICT Pre-Expansion scanner methodology — the eleven-state ladder, higher-timeframe bias, premium/discount and OTE, the ten score components, and how to read the page.",
};

export default function ICTGuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
