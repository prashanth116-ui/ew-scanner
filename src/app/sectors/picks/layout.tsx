import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock Picks",
  description: "Conviction-scored stock picks, entry signals, and pullback watch from sector rotation analysis.",
  alternates: { canonical: "https://quantradar.com/sectors/picks" },
  openGraph: {
    title: "Stock Picks | QuantRadar",
    description: "Conviction-scored stock picks, entry signals, and pullback watch from sector rotation analysis.",
    url: "https://quantradar.com/sectors/picks",
    siteName: "QuantRadar",
    type: "website",
  },
};

export default function PicksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
