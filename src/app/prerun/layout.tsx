import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pre-Run Scanner",
  description:
    "Multi-bagger stock screener — algorithmic scoring across 7 criteria, sector buckets, and AI narrative analysis.",
};

export default function PreRunLayout({ children }: { children: React.ReactNode }) {
  return children;
}
