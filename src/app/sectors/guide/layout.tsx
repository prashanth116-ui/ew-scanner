import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sector Rotation Guide",
  description:
    "How to read and interpret the sector rotation dashboard, RRG quadrants, leading indicators, and composite scores.",
  alternates: { canonical: "https://quantradar.com/sectors/guide" },
  openGraph: {
    title: "Sector Rotation Guide | QuantRadar",
    description:
      "How to read and interpret the sector rotation dashboard, RRG quadrants, leading indicators, and composite scores.",
    url: "https://quantradar.com/sectors/guide",
    siteName: "QuantRadar",
    type: "website",
  },
};

export default function SectorGuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
