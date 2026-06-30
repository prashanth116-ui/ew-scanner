import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Inflection Engine Backtest",
  description: "Backtest inflection engine signals with forward return analysis.",
};

export default function InflectionBacktestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
