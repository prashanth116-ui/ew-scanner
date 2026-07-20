import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crypto Sector Rotation",
  description:
    "Crypto sector rotation dashboard with 10 narrative categories, RRG quadrants, BTC-relative strength, and conviction-scored token picks.",
  alternates: { canonical: "https://quantradar.com/sectors/crypto" },
  openGraph: {
    title: "Crypto Sector Rotation | QuantRadar",
    description:
      "Crypto sector rotation dashboard with 10 narrative categories, RRG quadrants, BTC-relative strength, and conviction-scored token picks.",
    url: "https://quantradar.com/sectors/crypto",
    siteName: "QuantRadar",
    type: "website",
  },
};

export default function CryptoRotationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
