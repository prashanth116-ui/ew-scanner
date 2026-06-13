import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Wave Scanner — Elliott Wave Detector",
  description:
    "Phase 2 Elliott Wave impulse detection with ABC corrections, Fibonacci retracement targets, and confidence scoring across futures and equities.",
};

export default function WaveScannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
