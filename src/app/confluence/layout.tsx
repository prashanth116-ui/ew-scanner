import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Confluence Scanner | EW Scanner",
  description:
    "Highest conviction setups — stocks passing all 4 scanners simultaneously.",
};

export default function ConfluenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
