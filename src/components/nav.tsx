"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Menu, X } from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Scanner" },
  { href: "/history", label: "History" },
  { href: "/watchlist", label: "Watchlists" },
  { href: "/squeeze", label: "Squeeze" },
  { href: "/guide", label: "Guide" },
  { href: "/learn", label: "Learn EW" },
];

export function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-[#2a2a2a] bg-[#0f0f0f]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-[#5ba3e6]" />
          <span className="text-lg font-bold tracking-tight text-white">
            EW Scanner
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 sm:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-[#185FA5]/20 text-[#5ba3e6]"
                  : "text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-md p-2 text-[#a0a0a0] hover:bg-[#1a1a1a] sm:hidden"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav className="border-t border-[#2a2a2a] bg-[#0f0f0f] px-4 py-3 sm:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-[#185FA5]/20 text-[#5ba3e6]"
                  : "text-[#a0a0a0] hover:bg-[#1a1a1a] hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
