import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pre-Run Watchlist",
  description: "Track pre-run candidates and monitor price movements.",
};

export default function PreRunWatchlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
