import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learn Elliott Wave",
  description:
    "Learn Elliott Wave theory from foundations to advanced trading — impulse waves, corrections, Fibonacci ratios, and multi-timeframe analysis.",
};

export default function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
