import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scan History",
  description: "View and compare past scan results",
};

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
