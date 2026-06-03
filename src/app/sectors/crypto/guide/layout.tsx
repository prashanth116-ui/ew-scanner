import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crypto Rotation Guide",
  description:
    "How to read and interpret the crypto rotation dashboard, RRG quadrants, composite scores, and token picks.",
};

export default function CryptoGuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
