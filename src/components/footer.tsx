import Link from "next/link";
import { Activity } from "lucide-react";
import { DataManager } from "@/components/data-manager";

const scannerLinks = [
  { href: "/", label: "EW Scanner" },
  { href: "/squeeze", label: "Squeeze Screener" },
  { href: "/prerun", label: "Pre-Run Scanner" },
  { href: "/sectors", label: "Sector Rotation" },
];

const resourceLinks = [
  { href: "/about", label: "About" },
  { href: "/guide", label: "EW Scanner Guide" },
  { href: "/learn", label: "Learn EW" },
  { href: "/pricing", label: "Pricing" },
];

const legalLinks = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/disclaimer", label: "Financial Disclaimer" },
];

export function Footer() {
  return (
    <footer className="border-t border-[#2a2a2a] bg-[#0f0f0f]">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#5ba3e6]" />
              <span className="text-sm font-bold text-white">EW Scanner</span>
            </div>
            <p className="text-xs leading-relaxed text-[#666]">
              Free algorithmic stock scanning powered by Elliott Wave theory and
              AI analysis.
            </p>
          </div>

          {/* Scanners */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#888]">
              Scanners
            </h3>
            <ul className="space-y-2">
              {scannerLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-xs text-[#666] transition-colors hover:text-[#a0a0a0]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#888]">
              Resources
            </h3>
            <ul className="space-y-2">
              {resourceLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-xs text-[#666] transition-colors hover:text-[#a0a0a0]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#888]">
              Legal
            </h3>
            <ul className="space-y-2">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-xs text-[#666] transition-colors hover:text-[#a0a0a0]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex items-center justify-between border-t border-[#2a2a2a] pt-4">
          <DataManager />
          <span className="text-xs text-[#555]">&copy; 2026 EW Scanner</span>
        </div>
      </div>
    </footer>
  );
}
