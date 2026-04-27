"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Zap, TrendingUp, BarChart3, Layers } from "lucide-react";

const scanners = [
  {
    id: "ew",
    href: "/",
    title: "EW Scanner",
    description:
      "Algorithmic Elliott Wave counting with Fibonacci analysis and AI-powered deep analysis across 600+ stocks.",
    icon: Activity,
    color: "#5ba3e6",
  },
  {
    id: "squeeze",
    href: "/squeeze",
    title: "Squeeze Screener",
    description:
      "Short squeeze setups with real-time short interest, days to cover, float analysis, and EW alignment.",
    icon: Zap,
    color: "#f59e0b",
  },
  {
    id: "prerun",
    href: "/prerun",
    title: "Pre-Run Scanner",
    description:
      "Multi-bagger candidates scored across 7 criteria — beaten-down stocks with structural catalysts.",
    icon: TrendingUp,
    color: "#10b981",
  },
  {
    id: "sectors",
    href: "/sectors",
    title: "Sector Rotation",
    description:
      "Multi-factor sector analysis with RRG quadrants, momentum scoring, and cross-sector pair ratios.",
    icon: BarChart3,
    color: "#8b5cf6",
  },
  {
    id: "confluence",
    href: "/confluence",
    title: "Confluence Scanner",
    description:
      "Highest conviction setups — stocks passing all 4 scanners simultaneously for maximum signal alignment.",
    icon: Layers,
    color: "#ec4899",
  },
];

function getCurrentScannerId(pathname: string): string {
  if (pathname.startsWith("/confluence")) return "confluence";
  if (pathname.startsWith("/sectors")) return "sectors";
  if (pathname.startsWith("/prerun")) return "prerun";
  if (pathname.startsWith("/squeeze")) return "squeeze";
  return "ew";
}

export function ScannerCTA() {
  const pathname = usePathname();
  const current = getCurrentScannerId(pathname);
  const others = scanners.filter((s) => s.id !== current);

  return (
    <section className="mt-12 border-t border-[#2a2a2a] pt-8">
      <h2 className="mb-6 text-center text-lg font-bold text-white">
        Explore More Scanners
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {others.map((s) => (
          <Link
            key={s.id}
            href={s.href}
            className="group rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-5 transition-colors hover:border-[#3a3a3a]"
          >
            <div className="mb-3 flex items-center gap-2.5">
              <s.icon
                className="h-5 w-5"
                style={{ color: s.color }}
              />
              <span className="text-sm font-bold text-white">{s.title}</span>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-[#888]">
              {s.description}
            </p>
            <span className="text-xs font-medium text-[#5ba3e6] opacity-0 transition-opacity group-hover:opacity-100">
              Open scanner &rarr;
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
