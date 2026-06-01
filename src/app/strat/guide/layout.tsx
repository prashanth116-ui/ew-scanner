import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Strat Guide",
  description:
    "The Strat methodology guide — bar types (1/2U/2D/3), combo setups, timeframe continuity, and broadening formation detection.",
};

export default function StratGuideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
