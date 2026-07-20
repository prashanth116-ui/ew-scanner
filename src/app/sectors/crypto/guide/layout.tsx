import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crypto Rotation Guide",
  description:
    "How to read and interpret the crypto rotation dashboard, RRG quadrants, composite scores, and token picks.",
  alternates: { canonical: "https://quantradar.com/sectors/crypto/guide" },
  openGraph: {
    title: "Crypto Rotation Guide | QuantRadar",
    description:
      "How to read and interpret the crypto rotation dashboard, RRG quadrants, composite scores, and token picks.",
    url: "https://quantradar.com/sectors/crypto/guide",
    siteName: "QuantRadar",
    type: "website",
  },
};

export default function CryptoGuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
