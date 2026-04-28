import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Confluence Guide",
  description:
    "How four independent scanners combine into one high-conviction signal.",
};

export default function ConfluenceGuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
