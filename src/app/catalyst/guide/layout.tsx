import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Radar Guide",
  description:
    "How AI Radar works — 17-factor scoring, verdict categories, AI infrastructure layers, and fire drill detection.",
};

export default function CatalystGuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
