import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pre-Run Watchlist",
};

export default function PreRunWatchlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
