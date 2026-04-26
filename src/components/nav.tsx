"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Menu, X } from "lucide-react";
import { useState } from "react";

const scannerTabs = [
  { id: "ew", label: "EW Scanner", href: "/" },
  { id: "squeeze", label: "Squeeze", href: "/squeeze" },
  { id: "prerun", label: "Pre-Run", href: "/prerun" },
] as const;

const subPages: Record<string, { href: string; label: string }[]> = {
  ew: [
    { href: "/", label: "Scanner" },
    { href: "/guide", label: "Guide" },
    { href: "/learn", label: "Learn" },
    { href: "/history", label: "History" },
    { href: "/watchlist", label: "Watchlist" },
  ],
  squeeze: [
    { href: "/squeeze", label: "Scanner" },
    { href: "/squeeze/guide", label: "Guide" },
    { href: "/squeeze/watchlist", label: "Watchlist" },
  ],
  prerun: [
    { href: "/prerun", label: "Scanner" },
    { href: "/prerun/guide", label: "Guide" },
    { href: "/prerun/watchlist", label: "Watchlist" },
    { href: "/prerun/history", label: "History" },
  ],
};

function getActiveScanner(pathname: string): "ew" | "squeeze" | "prerun" {
  if (pathname.startsWith("/prerun")) return "prerun";
  if (pathname.startsWith("/squeeze")) return "squeeze";
  return "ew";
}

export function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeScanner = getActiveScanner(pathname);
  const activeSubPages = subPages[activeScanner];

  const isSubActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/squeeze") return pathname === "/squeeze";
    if (href === "/prerun") return pathname === "/prerun";
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[#2a2a2a] bg-[#0f0f0f]/95 backdrop-blur-sm">
      {/* Row 1: Logo + Scanner Tabs */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-[#5ba3e6]" />
          <span className="text-lg font-bold tracking-tight text-white">
            EW Scanner
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {/* Desktop scanner tabs */}
          <nav className="hidden items-center gap-1 sm:flex">
            {scannerTabs.map((tab) => (
              <Link
                key={tab.id}
                href={tab.href}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeScanner === tab.id
                    ? "border-b-2 border-[#5ba3e6] text-white"
                    : "text-[#a0a0a0] hover:text-white"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-md p-2 text-[#a0a0a0] hover:bg-[#1a1a1a] sm:hidden"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Row 2: Sub-nav (desktop only) */}
      <div className="hidden border-t border-[#2a2a2a] sm:block">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-1 px-6 py-1.5">
          {activeSubPages.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isSubActive(item.href)
                  ? "bg-[#185FA5]/20 text-[#5ba3e6]"
                  : "text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav className="border-t border-[#2a2a2a] bg-[#0f0f0f] px-4 py-3 sm:hidden">
          {scannerTabs.map((tab) => (
            <div key={tab.id}>
              <div className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-[#666]">
                {tab.label}
              </div>
              {subPages[tab.id].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex rounded-md px-3 py-2 pl-6 text-sm font-medium transition-colors ${
                    isSubActive(item.href)
                      ? "bg-[#185FA5]/20 text-[#5ba3e6]"
                      : "text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              {tab.id !== "prerun" && (
                <div className="mx-3 my-2 h-px bg-[#2a2a2a]" />
              )}
            </div>
          ))}
        </nav>
      )}
    </header>
  );
}
