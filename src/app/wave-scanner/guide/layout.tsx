import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Wave Scanner Guide — Elliott Wave Methodology",
  description:
    "Learn the Phase 2 Elliott Wave detection methodology: impulse rules, ABC corrections, Fibonacci retracement targets, and confidence scoring.",
};

export default function WaveScannerGuideLayout({ children }: { children: React.ReactNode }) {
  return children;
}
