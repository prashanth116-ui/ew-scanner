import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Daily Market Brief",
  description:
    "Rule-based daily market briefing synthesizing sector rotation data into actionable posture, tiers, and stock picks.",
};

export default function BriefLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
