import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pre-Run History",
};

export default function PreRunHistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
