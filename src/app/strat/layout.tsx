import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Strat Scanner",
  description:
    "Rob Smith's Strat methodology — bar classification, combo detection, and multi-timeframe continuity across monthly, weekly, and daily charts.",
};

export default function StratLayout({ children }: { children: React.ReactNode }) {
  return children;
}
