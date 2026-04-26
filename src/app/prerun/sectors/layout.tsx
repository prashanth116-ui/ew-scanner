import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sector Rotation Tracker",
  description:
    "Multi-factor sector rotation dashboard with RRG quadrants, leading indicators, smart money detection, and stock selection.",
};

export default function SectorRotationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
