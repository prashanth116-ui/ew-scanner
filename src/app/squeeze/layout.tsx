import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Squeeze Screener",
  description:
    "Screen 1,300+ stocks for short squeeze setups with real-time short interest, days to cover, float analysis, and Elliott Wave alignment scoring.",
};

export default function SqueezeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
