import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pre-Run Guide",
};

export default function PreRunGuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
