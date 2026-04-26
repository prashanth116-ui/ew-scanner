import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pre-Run Guide",
  description:
    "Pre-Run scanner methodology — three gates, seven scoring criteria, verdict tiers, case studies (SNDK, CAR, CVNA).",
};

export default function PreRunGuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
