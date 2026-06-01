import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Confluence Scanner",
  description:
    "Highest conviction setups — stocks passing multiple scanners (EW, Squeeze, Pre-Run, Strat) simultaneously.",
};

export default function ConfluenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
