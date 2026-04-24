import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Squeeze Watchlist",
};

export default function SqueezeWatchlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
