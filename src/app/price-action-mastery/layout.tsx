import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Price Action Mastery — From Beginner to Institutional-Level Market Reading",
  description:
    "A comprehensive 25-layer educational guide covering price action from basic market structure to institutional-level concepts including auction theory, microstructure, positioning dynamics, and game theory.",
  openGraph: {
    title: "Price Action Mastery",
    description:
      "From Beginner to Institutional-Level Market Reading — 25 layers of price action education with practical examples on ES, NQ, and equities.",
  },
};

export default function PriceActionMasteryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
