import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sector Rotation Tracker",
  description:
    "Multi-factor sector rotation dashboard with RRG quadrants, leading indicators, smart money detection, and stock selection.",
  alternates: { canonical: "https://quantradar.com/sectors" },
  openGraph: {
    title: "Sector Rotation Tracker | QuantRadar",
    description:
      "Multi-factor sector rotation dashboard with RRG quadrants, leading indicators, smart money detection, and stock selection.",
    url: "https://quantradar.com/sectors",
    siteName: "QuantRadar",
    type: "website",
  },
};

export default function SectorRotationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
