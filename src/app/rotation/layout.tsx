import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rotation Tracker",
  description:
    "Track sector rotation with relative strength rankings, momentum scoring, and historical trend comparison.",
};

export default function RotationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
