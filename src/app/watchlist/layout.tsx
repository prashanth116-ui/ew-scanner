import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Watchlists | EW Scanner",
  description: "Manage stock watchlists and track score changes",
};

export default function WatchlistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
