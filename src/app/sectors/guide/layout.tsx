import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sector Rotation Guide",
  description:
    "How to read and interpret the sector rotation dashboard, RRG quadrants, leading indicators, and composite scores.",
};

export default function SectorGuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
