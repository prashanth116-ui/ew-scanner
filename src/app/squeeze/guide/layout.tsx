import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Squeeze Guide",
  description:
    "Short squeeze mechanics, scoring methodology, case studies (GME, CVNA, BBBY), risk management, and screener presets.",
};

export default function SqueezeGuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
