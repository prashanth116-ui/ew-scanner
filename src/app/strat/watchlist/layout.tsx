import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Strat Watchlist",
  description: "Track Strat setups and combos with score change alerts.",
};

export default function StratWatchlistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
