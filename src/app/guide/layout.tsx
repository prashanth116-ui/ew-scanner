import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Guide",
  description:
    "How to use the EW Scanner — reading sparklines, confidence badges, scanner modes, and best practices.",
};

export default function GuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
