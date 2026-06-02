import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock Picks | Sector Rotation",
  description:
    "Conviction-scored stock picks from sector rotation analysis with quality gates, RRG quadrants, and leading indicators.",
};

export default function StockPicksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
