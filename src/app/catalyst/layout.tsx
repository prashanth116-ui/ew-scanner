import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Radar",
  description:
    "AI infrastructure spike detector — 17-factor scoring across 78 tickers in 11 layers with fire drill alerts and peer-spike detection.",
};

export default function CatalystLayout({ children }: { children: React.ReactNode }) {
  return children;
}
