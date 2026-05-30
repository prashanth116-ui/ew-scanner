import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Catalyst Scanner Guide",
  description:
    "How the catalyst scanner works — 13-factor scoring, verdict categories, AI infrastructure layers, and fire drill detection.",
};

export default function CatalystGuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
