import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pre-Run History",
  description: "Pre-Run scan results and watchlist change log.",
};

export default function PreRunHistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
