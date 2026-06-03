import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock Picks",
  description: "Conviction-scored stock picks, entry signals, and pullback watch from sector rotation analysis.",
};

export default function PicksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
