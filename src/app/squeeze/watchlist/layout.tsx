import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Squeeze Watchlist",
  description: "Track squeeze candidates and monitor score changes over time.",
};

export default function SqueezeWatchlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
