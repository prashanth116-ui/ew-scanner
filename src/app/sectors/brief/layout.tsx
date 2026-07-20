import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Daily Market Brief",
  description:
    "Rule-based daily market briefing synthesizing sector rotation data into actionable posture, tiers, and stock picks.",
  alternates: { canonical: "https://quantradar.com/sectors/brief" },
  openGraph: {
    title: "Daily Market Brief | QuantRadar",
    description:
      "Rule-based daily market briefing synthesizing sector rotation data into actionable posture, tiers, and stock picks.",
    url: "https://quantradar.com/sectors/brief",
    siteName: "QuantRadar",
    type: "website",
  },
};

export default function BriefLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
