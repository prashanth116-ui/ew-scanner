"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Menu, X } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { AuthButton } from "@/components/auth-button";

const scannerTabs = [
  { id: "ew", label: "EW Scanner", href: "/" },
  { id: "squeeze", label: "Squeeze", href: "/squeeze" },
  { id: "prerun", label: "Pre-Run", href: "/prerun" },
  { id: "sectors", label: "Sectors", href: "/sectors" },
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
  sectors: [
    { href: "/sectors", label: "Dashboard" },
    { href: "/sectors/guide", label: "Guide" },
  ],
};

function getActiveScanner(pathname: string): "ew" | "squeeze" | "prerun" | "sectors" {
  if (pathname.startsWith("/sectors")) return "sectors";
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
    if (href === "/sectors") return pathname === "/sectors";
    return pathname.startsWith(href);
  };

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  // Close mobile menu on Escape key
  useEffect(() => {
    if (!mobileOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobile();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [mobileOpen, closeMobile]);

  // Close mobile menu on route change
  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  return (
    <header className="sticky top-0 z-50 border-b border-[#2a2a2a] bg-[#0f0f0f]/95 backdrop-blur-sm">
      {/* Row 1: Logo + Scanner Tabs */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2" aria-label="EW Scanner home">
          <Activity className="h-5 w-5 text-[#5ba3e6]" aria-hidden="true" />
          <span className="text-lg font-bold tracking-tight text-white">
            EW Scanner
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {/* Desktop scanner tabs */}
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Scanner selection">
            <Link
              href="/about"
              aria-current={pathname === "/about" ? "page" : undefined}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                pathname === "/about"
                  ? "border-b-2 border-[#5ba3e6] text-white"
                  : "text-[#a0a0a0] hover:text-white"
              }`}
            >
              About
            </Link>
            {scannerTabs.map((tab) => (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={activeScanner === tab.id ? "page" : undefined}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeScanner === tab.id && pathname !== "/about"
                    ? "border-b-2 border-[#5ba3e6] text-white"
                    : "text-[#a0a0a0] hover:text-white"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>

          {/* Pricing + Auth */}
          <div className="hidden items-center gap-2 sm:flex">
            <Link
              href="/pricing"
              className={`px-2 py-1.5 text-sm font-medium transition-colors ${
                pathname === "/pricing"
                  ? "text-[#5ba3e6]"
                  : "text-[#a0a0a0] hover:text-white"
              }`}
            >
              Pricing
            </Link>
            <AuthButton />
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-md p-2 text-[#a0a0a0] hover:bg-[#1a1a1a] sm:hidden"
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Row 2: Sub-nav (desktop only) */}
      <div className="hidden border-t border-[#2a2a2a] sm:block">
        <nav
          className="mx-auto flex max-w-7xl items-center justify-center gap-1 px-6 py-1.5"
          aria-label={`${scannerTabs.find((t) => t.id === activeScanner)?.label} pages`}
        >
          {activeSubPages.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isSubActive(item.href) ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isSubActive(item.href)
                  ? "bg-[#185FA5]/20 text-[#5ba3e6]"
                  : "text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav
          className="border-t border-[#2a2a2a] bg-[#0f0f0f] px-4 py-3 sm:hidden"
          aria-label="Mobile navigation"
        >
          <Link
            href="/about"
            onClick={closeMobile}
            aria-current={pathname === "/about" ? "page" : undefined}
            className={`flex rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              pathname === "/about"
                ? "bg-[#185FA5]/20 text-[#5ba3e6]"
                : "text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
            }`}
          >
            About
          </Link>
          <div className="mx-3 my-2 h-px bg-[#2a2a2a]" aria-hidden="true" />
          {scannerTabs.map((tab) => (
            <div key={tab.id} role="group" aria-label={tab.label}>
              <div className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-[#666]">
                {tab.label}
              </div>
              {subPages[tab.id].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMobile}
                  aria-current={isSubActive(item.href) ? "page" : undefined}
                  className={`flex rounded-md px-3 py-2 pl-6 text-sm font-medium transition-colors ${
                    isSubActive(item.href)
                      ? "bg-[#185FA5]/20 text-[#5ba3e6]"
                      : "text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              {tab.id !== "sectors" && (
                <div className="mx-3 my-2 h-px bg-[#2a2a2a]" aria-hidden="true" />
              )}
            </div>
          ))}
          <div className="mx-3 my-2 h-px bg-[#2a2a2a]" aria-hidden="true" />
          <Link
            href="/pricing"
            onClick={closeMobile}
            className="flex rounded-md px-3 py-2 text-sm font-medium text-[#a0a0a0] transition-colors hover:bg-[#1a1a1a] hover:text-white"
          >
            Pricing
          </Link>
          <div className="px-3 py-2">
            <AuthButton />
          </div>
        </nav>
      )}
    </header>
  );
}
