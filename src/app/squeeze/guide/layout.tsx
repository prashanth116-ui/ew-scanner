import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Squeeze Guide",
};

export default function SqueezeGuideLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
