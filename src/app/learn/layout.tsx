import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learn Elliott Wave",
};

export default function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
