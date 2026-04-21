"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  AlertTriangle,
  Target,
  Layers,
  TrendingUp,
  TrendingDown,
  Brain,
  Crosshair,
  Zap,
  Ruler,
  Volume2,
  ListChecks,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════
   SVG DIAGRAM COMPONENTS
   ═══════════════════════════════════════════════════════ */

function WaveCycleDiagram() {
  // 5-wave impulse (blue) + 3-wave correction (red)
  const imp = "40,250 115,165 160,220 270,55 330,120 400,35";
  const cor = "400,35 465,170 505,105 575,230";
  return (
    <div className="my-6 flex justify-center">
      <svg viewBox="0 0 640 310" className="w-full max-w-xl" aria-label="Elliott Wave 5-3 cycle diagram">
        {/* grid */}
        <line x1="30" y1="270" x2="600" y2="270" stroke="#2a2a2a" strokeDasharray="4" />
        {/* impulse */}
        <polyline points={imp} fill="none" stroke="#5ba3e6" strokeWidth="2.5" strokeLinejoin="round" />
        {/* correction */}
        <polyline points={cor} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinejoin="round" strokeDasharray="8 4" />
        {/* wave labels */}
        <text x="28" y="260" fontSize="13" fill="#a0a0a0" fontFamily="monospace">0</text>
        <text x="108" y="155" fontSize="14" fill="#5ba3e6" fontWeight="bold" fontFamily="monospace">1</text>
        <text x="153" y="238" fontSize="14" fill="#5ba3e6" fontWeight="bold" fontFamily="monospace">2</text>
        <text x="263" y="45" fontSize="14" fill="#5ba3e6" fontWeight="bold" fontFamily="monospace">3</text>
        <text x="333" y="138" fontSize="14" fill="#5ba3e6" fontWeight="bold" fontFamily="monospace">4</text>
        <text x="393" y="25" fontSize="14" fill="#5ba3e6" fontWeight="bold" fontFamily="monospace">5</text>
        <text x="468" y="185" fontSize="14" fill="#ef4444" fontWeight="bold" fontFamily="monospace">A</text>
        <text x="508" y="97" fontSize="14" fill="#ef4444" fontWeight="bold" fontFamily="monospace">B</text>
        <text x="568" y="248" fontSize="14" fill="#ef4444" fontWeight="bold" fontFamily="monospace">C</text>
        {/* brackets */}
        <line x1="40" y1="285" x2="400" y2="285" stroke="#5ba3e6" strokeWidth="1.5" />
        <text x="155" y="305" fontSize="12" fill="#5ba3e6" textAnchor="middle">Impulse (5 waves)</text>
        <line x1="400" y1="285" x2="575" y2="285" stroke="#ef4444" strokeWidth="1.5" />
        <text x="487" y="305" fontSize="12" fill="#ef4444" textAnchor="middle">Correction (3 waves)</text>
      </svg>
    </div>
  );
}

function FibRetracementDiagram() {
  const top = 50;
  const bot = 250;
  const range = bot - top; // 200
  const levels = [
    { pct: 0, label: "0% (Top)" },
    { pct: 23.6, label: "23.6%" },
    { pct: 38.2, label: "38.2%" },
    { pct: 50, label: "50%" },
    { pct: 61.8, label: "61.8%" },
    { pct: 78.6, label: "78.6%" },
    { pct: 100, label: "100% (Bottom)" },
  ];
  const retY = top + range * 0.618; // wave 2 retracement at 61.8%

  return (
    <div className="my-6 flex justify-center">
      <svg viewBox="0 0 460 300" className="w-full max-w-md" aria-label="Fibonacci retracement levels">
        {/* fib levels */}
        {levels.map(({ pct, label }) => {
          const y = top + (pct / 100) * range;
          const isKey = pct === 50 || pct === 61.8;
          return (
            <g key={pct}>
              <line x1="50" y1={y} x2="350" y2={y} stroke={isKey ? "#5ba3e6" : "#2a2a2a"} strokeWidth={isKey ? 1.5 : 1} strokeDasharray={isKey ? "0" : "4"} />
              <text x="358" y={y + 4} fontSize="11" fill={isKey ? "#5ba3e6" : "#a0a0a0"} fontFamily="monospace">{label}</text>
            </g>
          );
        })}
        {/* golden zone highlight */}
        <rect x="50" y={top + range * 0.5} width="300" height={range * 0.118} fill="#5ba3e6" opacity="0.08" rx="2" />
        <text x="55" y={top + range * 0.56} fontSize="10" fill="#5ba3e6" opacity="0.7">Golden zone</text>
        {/* wave 1 rise */}
        <polyline points={`80,${bot} 180,${top}`} fill="none" stroke="#5ba3e6" strokeWidth="2.5" />
        <text x="66" y={bot + 16} fontSize="12" fill="#a0a0a0">Start</text>
        <text x="172" y={top - 8} fontSize="12" fill="#5ba3e6" fontWeight="bold">W1</text>
        {/* wave 2 retracement */}
        <polyline points={`180,${top} 280,${retY}`} fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="6 3" />
        <text x="284" y={retY + 4} fontSize="12" fill="#ef4444" fontWeight="bold">W2</text>
        {/* arrow showing entry zone */}
        <text x="296" y={retY + 20} fontSize="10" fill="#22c55e">← Entry zone</text>
      </svg>
    </div>
  );
}

function CorrectionPatternsDiagram() {
  return (
    <div className="my-6 flex justify-center">
      <svg viewBox="0 0 680 230" className="w-full max-w-2xl" aria-label="Correction patterns: zigzag, flat, triangle">
        {/* ZIGZAG */}
        <polyline points="30,50 85,175 125,85 185,195" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round" />
        {/* origin marker */}
        <circle cx="30" cy="50" r="3" fill="#a0a0a0" opacity="0.5" />
        {/* labels at wave endpoints */}
        <text x="78" y="193" fontSize="11" fill="#ef4444" fontWeight="bold">A</text>
        <text x="118" y="78" fontSize="11" fill="#ef4444" fontWeight="bold">B</text>
        <text x="178" y="210" fontSize="11" fill="#ef4444" fontWeight="bold">C</text>
        <text x="100" y="225" fontSize="12" fill="#a0a0a0" textAnchor="middle" fontWeight="600">Zigzag (5-3-5)</text>
        {/* dashed start line */}
        <line x1="30" y1="50" x2="30" y2="195" stroke="#2a2a2a" strokeDasharray="3" />

        {/* FLAT */}
        <polyline points="250,50 305,145 355,55 410,165" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round" />
        {/* origin marker */}
        <circle cx="250" cy="50" r="3" fill="#a0a0a0" opacity="0.5" />
        {/* labels at wave endpoints */}
        <text x="298" y="162" fontSize="11" fill="#ef4444" fontWeight="bold">A</text>
        <text x="348" y="48" fontSize="11" fill="#ef4444" fontWeight="bold">B</text>
        <text x="413" y="178" fontSize="11" fill="#ef4444" fontWeight="bold">C</text>
        <text x="330" y="225" fontSize="12" fill="#a0a0a0" textAnchor="middle" fontWeight="600">Flat (3-3-5)</text>
        <line x1="250" y1="50" x2="250" y2="165" stroke="#2a2a2a" strokeDasharray="3" />

        {/* TRIANGLE */}
        <polyline points="480,45 515,160 545,70 570,140 590,90 610,125" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round" />
        {/* converging trendlines */}
        <line x1="480" y1="45" x2="620" y2="80" stroke="#5ba3e6" strokeWidth="1" strokeDasharray="4" />
        <line x1="515" y1="160" x2="620" y2="118" stroke="#5ba3e6" strokeWidth="1" strokeDasharray="4" />
        {/* origin marker */}
        <circle cx="480" cy="45" r="3" fill="#a0a0a0" opacity="0.5" />
        {/* labels at wave endpoints */}
        <text x="508" y="177" fontSize="10" fill="#ef4444" fontWeight="bold">A</text>
        <text x="538" y="63" fontSize="10" fill="#ef4444" fontWeight="bold">B</text>
        <text x="573" y="155" fontSize="10" fill="#ef4444" fontWeight="bold">C</text>
        <text x="593" y="83" fontSize="10" fill="#ef4444" fontWeight="bold">D</text>
        <text x="613" y="138" fontSize="10" fill="#ef4444" fontWeight="bold">E</text>
        <text x="545" y="225" fontSize="12" fill="#a0a0a0" textAnchor="middle" fontWeight="600">Triangle (3-3-3-3-3)</text>
        {/* breakout arrow */}
        <polyline points="610,125 645,100" fill="none" stroke="#22c55e" strokeWidth="2" markerEnd="url(#arrowG)" />
        <defs>
          <marker id="arrowG" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8" fill="none" stroke="#22c55e" strokeWidth="1.5" />
          </marker>
        </defs>
      </svg>
    </div>
  );
}

function DiagonalDiagram() {
  // Ending diagonal with throwover and reversal
  return (
    <div className="my-6 flex justify-center">
      <svg viewBox="0 0 420 300" className="w-full max-w-sm" aria-label="Ending diagonal (wedge) pattern">
        {/* converging trendlines */}
        <line x1="30" y1="250" x2="310" y2="55" stroke="#5ba3e6" strokeWidth="1" strokeDasharray="5" opacity="0.5" />
        <line x1="95" y1="250" x2="330" y2="75" stroke="#5ba3e6" strokeWidth="1" strokeDasharray="5" opacity="0.5" />
        {/* diagonal waves */}
        <polyline points="40,250 105,155 130,210 230,85 265,145 310,50" fill="none" stroke="#5ba3e6" strokeWidth="2.5" strokeLinejoin="round" />
        {/* throwover + reversal */}
        <polyline points="310,50 330,40" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="4" />
        <polyline points="330,40 390,240" fill="none" stroke="#ef4444" strokeWidth="2.5" />
        {/* labels */}
        <text x="98" y="148" fontSize="12" fill="#5ba3e6" fontWeight="bold">1</text>
        <text x="123" y="228" fontSize="12" fill="#5ba3e6" fontWeight="bold">2</text>
        <text x="223" y="78" fontSize="12" fill="#5ba3e6" fontWeight="bold">3</text>
        <text x="268" y="162" fontSize="12" fill="#5ba3e6" fontWeight="bold">4</text>
        <text x="300" y="43" fontSize="12" fill="#5ba3e6" fontWeight="bold">5</text>
        {/* throwover label */}
        <text x="335" y="35" fontSize="10" fill="#ef4444">Throwover</text>
        {/* overlap zone */}
        <rect x="90" y="145" width="190" height="10" fill="#f59e0b" opacity="0.12" rx="2" />
        <text x="130" y="140" fontSize="9" fill="#f59e0b" opacity="0.8">W4 overlaps W1 (allowed in diagonals)</text>
        {/* reversal label */}
        <text x="370" y="235" fontSize="11" fill="#ef4444" fontWeight="bold">Reversal</text>
      </svg>
    </div>
  );
}

function WaveNestingDiagram() {
  return (
    <div className="my-6 flex justify-center">
      <svg viewBox="0 0 600 320" className="w-full max-w-xl" aria-label="Fractal wave nesting across degrees">
        {/* Large-degree wave outline (faded) */}
        <polyline points="30,270 90,210 120,240 350,40 400,100 470,25" fill="none" stroke="#5ba3e6" strokeWidth="1.5" opacity="0.25" strokeDasharray="6" />
        {/* Sub-waves inside wave 3 */}
        <polyline
          points="120,240 175,180 195,205 280,70 310,105 350,40"
          fill="none" stroke="#5ba3e6" strokeWidth="2.5" strokeLinejoin="round"
        />
        {/* Primary labels */}
        <text x="75" y="203" fontSize="18" fill="#5ba3e6" fontWeight="bold" opacity="0.4">①</text>
        <text x="110" y="258" fontSize="18" fill="#5ba3e6" fontWeight="bold" opacity="0.4">②</text>
        <text x="230" y="30" fontSize="18" fill="#5ba3e6" fontWeight="bold" opacity="0.4">③</text>
        <text x="393" y="118" fontSize="18" fill="#5ba3e6" fontWeight="bold" opacity="0.4">④</text>
        <text x="460" y="20" fontSize="18" fill="#5ba3e6" fontWeight="bold" opacity="0.4">⑤</text>
        {/* Sub-wave labels inside wave 3 */}
        <text x="162" y="174" fontSize="13" fill="#22c55e" fontWeight="bold">(1)</text>
        <text x="188" y="220" fontSize="13" fill="#22c55e" fontWeight="bold">(2)</text>
        <text x="270" y="60" fontSize="13" fill="#22c55e" fontWeight="bold">(3)</text>
        <text x="313" y="120" fontSize="13" fill="#22c55e" fontWeight="bold">(4)</text>
        <text x="340" y="33" fontSize="13" fill="#22c55e" fontWeight="bold">(5)</text>
        {/* bracket under wave 3 sub-waves */}
        <line x1="120" y1="280" x2="350" y2="280" stroke="#22c55e" strokeWidth="1.5" />
        <text x="235" y="300" fontSize="11" fill="#22c55e" textAnchor="middle">Wave ③ contains 5 intermediate sub-waves</text>
        {/* degree legend */}
        <rect x="410" y="160" width="170" height="70" rx="6" fill="#1a1a1a" stroke="#2a2a2a" />
        <text x="425" y="180" fontSize="11" fill="#a0a0a0" fontWeight="600">Degree</text>
        <line x1="425" y1="185" x2="560" y2="185" stroke="#2a2a2a" />
        <circle cx="430" cy="200" r="4" fill="#5ba3e6" opacity="0.4" />
        <text x="440" y="204" fontSize="10" fill="#a0a0a0">Primary ①②③④⑤</text>
        <circle cx="430" cy="218" r="4" fill="#22c55e" />
        <text x="440" y="222" fontSize="10" fill="#a0a0a0">Intermediate (1)(2)(3)</text>
      </svg>
    </div>
  );
}

function ChannelingDiagram() {
  // 5-wave impulse with base channel and acceleration channel
  // Wave points: 0(40,260) 1(110,170) 2(155,230) 3(260,60) 4(320,130) 5(395,40)
  return (
    <div className="my-6 flex justify-center">
      <svg viewBox="0 0 520 310" className="w-full max-w-lg" aria-label="Elliott Wave channeling technique">
        {/* Base channel: line through 0 and 2, parallel through 1 */}
        <line x1="10" y1="275" x2="450" y2="178" stroke="#f59e0b" strokeWidth="1" strokeDasharray="6 3" opacity="0.5" />
        <line x1="80" y1="185" x2="450" y2="108" stroke="#f59e0b" strokeWidth="1" strokeDasharray="6 3" opacity="0.5" />
        <text x="452" y="175" fontSize="9" fill="#f59e0b" opacity="0.7">Base channel (0→2)</text>
        <text x="452" y="105" fontSize="9" fill="#f59e0b" opacity="0.7">Parallel thru 1</text>

        {/* Acceleration channel: line through 2 and 4, parallel through 3 */}
        <line x1="120" y1="260" x2="470" y2="122" stroke="#22c55e" strokeWidth="1.2" strokeDasharray="5 3" opacity="0.6" />
        <line x1="225" y1="88" x2="470" y2="-8" stroke="#22c55e" strokeWidth="1.2" strokeDasharray="5 3" opacity="0.6" />
        <text x="380" y="140" fontSize="9" fill="#22c55e" opacity="0.8">Accel channel (2→4)</text>
        <text x="410" y="15" fontSize="9" fill="#22c55e" opacity="0.8">→ W5 target zone</text>

        {/* Impulse wave */}
        <polyline points="40,260 110,170 155,230 260,60 320,130 395,40" fill="none" stroke="#5ba3e6" strokeWidth="2.5" strokeLinejoin="round" />

        {/* Labels */}
        <text x="28" y="272" fontSize="13" fill="#a0a0a0" fontWeight="bold">0</text>
        <text x="103" y="162" fontSize="13" fill="#5ba3e6" fontWeight="bold">1</text>
        <text x="148" y="248" fontSize="13" fill="#5ba3e6" fontWeight="bold">2</text>
        <text x="253" y="52" fontSize="13" fill="#5ba3e6" fontWeight="bold">3</text>
        <text x="323" y="145" fontSize="13" fill="#5ba3e6" fontWeight="bold">4</text>
        <text x="388" y="32" fontSize="13" fill="#5ba3e6" fontWeight="bold">5</text>

        {/* W5 target zone highlight */}
        <rect x="375" y="20" width="40" height="35" fill="#22c55e" opacity="0.08" rx="3" />
        <text x="378" y="68" fontSize="8" fill="#22c55e">Target</text>

        {/* Wave 3 overshoot arrow */}
        <line x1="260" y1="60" x2="260" y2="90" stroke="#f59e0b" strokeWidth="1.5" opacity="0.6" />
        <text x="218" y="100" fontSize="8" fill="#f59e0b" opacity="0.8">W3 overshoot</text>
      </svg>
    </div>
  );
}

function VolumePatternDiagram() {
  // Volume bars under a 5-wave impulse showing typical volume pattern
  const wavePoints = "40,160 100,100 135,135 220,30 270,75 330,20";
  // Volume heights (relative): W1=40, W2=25, W3=80, W4=20, W5=35
  const volumes = [
    { x: 60, h: 40, label: "W1", color: "#5ba3e6" },
    { x: 110, h: 25, label: "W2", color: "#a0a0a0" },
    { x: 170, h: 80, label: "W3", color: "#22c55e" },
    { x: 240, h: 20, label: "W4", color: "#a0a0a0" },
    { x: 295, h: 35, label: "W5", color: "#ef4444" },
  ];
  const baseY = 270;
  return (
    <div className="my-6 flex justify-center">
      <svg viewBox="0 0 420 300" className="w-full max-w-md" aria-label="Volume pattern across Elliott waves">
        {/* Price line */}
        <polyline points={wavePoints} fill="none" stroke="#5ba3e6" strokeWidth="2" strokeLinejoin="round" />
        {/* Price labels */}
        <text x="93" y="93" fontSize="11" fill="#5ba3e6" fontWeight="bold">1</text>
        <text x="128" y="150" fontSize="11" fill="#5ba3e6" fontWeight="bold">2</text>
        <text x="213" y="23" fontSize="11" fill="#5ba3e6" fontWeight="bold">3</text>
        <text x="273" y="88" fontSize="11" fill="#5ba3e6" fontWeight="bold">4</text>
        <text x="323" y="15" fontSize="11" fill="#5ba3e6" fontWeight="bold">5</text>

        {/* Separator */}
        <line x1="30" y1="185" x2="380" y2="185" stroke="#2a2a2a" strokeWidth="1" />
        <text x="385" y="189" fontSize="9" fill="#666">Volume</text>

        {/* Volume bars */}
        {volumes.map((v) => (
          <g key={v.label}>
            <rect x={v.x} y={baseY - v.h} width="30" height={v.h} rx="2" fill={v.color} opacity="0.3" />
            <rect x={v.x} y={baseY - v.h} width="30" height={v.h} rx="2" stroke={v.color} strokeWidth="1" fill="none" opacity="0.6" />
            <text x={v.x + 15} y={baseY + 14} fontSize="9" fill="#a0a0a0" textAnchor="middle">{v.label}</text>
          </g>
        ))}

        {/* Divergence arrow between W3 and W5 volume */}
        <line x1="185" y1={baseY - 80 - 5} x2="310" y2={baseY - 35 - 5} stroke="#ef4444" strokeWidth="1.2" strokeDasharray="4" />
        <text x="230" y={baseY - 55} fontSize="9" fill="#ef4444" fontWeight="600">Volume divergence</text>

        {/* Peak label on W3 */}
        <text x="60" y={baseY - 82} fontSize="8" fill="#22c55e">Highest vol</text>
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   HELPER COMPONENTS
   ═══════════════════════════════════════════════════════ */

function Callout({
  children,
  type = "info",
}: {
  children: React.ReactNode;
  type?: "info" | "rule" | "warn";
}) {
  const border = { info: "border-[#185FA5]", rule: "border-[#185FA5]", warn: "border-amber-500" };
  const bg = { info: "bg-[#185FA5]/8", rule: "bg-[#185FA5]/8", warn: "bg-amber-500/8" };
  return (
    <div className={`my-4 rounded-lg border-l-4 p-4 ${border[type]} ${bg[type]}`}>
      {children}
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-[#2a2a2a]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#262626]">
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-2.5 text-left font-medium text-[#a0a0a0]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-[#2a2a2a]/60">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2 text-[#c0c0c0]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionH3({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 mt-6 text-base font-bold text-white">{children}</h3>;
}

function Prose({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3 text-sm leading-relaxed text-[#c0c0c0]">{children}</div>;
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 rounded-lg bg-[#0f0f0f] p-4 font-mono text-sm leading-relaxed text-[#5ba3e6]">
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MODULE DATA
   ═══════════════════════════════════════════════════════ */

const MODULES = [
  { n: 1, title: "Foundations", icon: BookOpen, desc: "What EW theory says, the 5-wave impulse, 3-wave correction, and 3 unbreakable rules" },
  { n: 2, title: "The Math", icon: Target, desc: "Fibonacci retracements, projections, and the confluence method" },
  { n: 3, title: "Reading Corrections", icon: Layers, desc: "Zigzags, flats, triangles, combinations, and a real-time checklist" },
  { n: 4, title: "Wave 3 vs Wave 5", icon: Zap, desc: "The single most valuable skill — fingerprints for wave 3 and wave 5" },
  { n: 5, title: "Advanced Patterns", icon: TrendingUp, desc: "Diagonals, extensions, and truncations" },
  { n: 6, title: "Multi-Timeframe Analysis", icon: Crosshair, desc: "Nine degrees, top-down workflow, and the golden rule" },
  { n: 7, title: "Trading Application", icon: TrendingDown, desc: "Highest-probability setups, stop placement, position management" },
  { n: 8, title: "Mindset", icon: Brain, desc: "Probabilistic thinking and the three principles to internalize" },
  { n: 9, title: "Channeling & Guidelines", icon: Ruler, desc: "Parallel channels, alternation, proportionality — the visual tools that project targets" },
  { n: 10, title: "Wave Personality & Volume", icon: Volume2, desc: "Each wave's character, sentiment, and how volume confirms your count" },
  { n: 11, title: "Practical Counting", icon: ListChecks, desc: "Step-by-step process for counting waves on a real chart, plus common mistakes" },
];

/* ═══════════════════════════════════════════════════════
   MODULE SHELL (collapsible wrapper)
   ═══════════════════════════════════════════════════════ */

function ModuleShell({
  n,
  open,
  toggle,
  children,
}: {
  n: number;
  open: boolean;
  toggle: (n: number) => void;
  children: React.ReactNode;
}) {
  const mod = MODULES[n - 1];
  const Icon = mod.icon;
  return (
    <section
      id={`module-${n}`}
      className="scroll-mt-20 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] transition-colors"
    >
      <button
        onClick={() => toggle(n)}
        className="flex w-full items-center justify-between gap-4 p-5 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#185FA5]/15">
            <Icon className="h-4 w-4 text-[#5ba3e6]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#5ba3e6]">
              Module {n}
            </p>
            <h2 className="text-lg font-bold text-white">{mod.title}</h2>
            {!open && (
              <p className="mt-0.5 truncate text-xs text-[#a0a0a0]">{mod.desc}</p>
            )}
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-5 w-5 shrink-0 text-[#a0a0a0]" />
        ) : (
          <ChevronDown className="h-5 w-5 shrink-0 text-[#a0a0a0]" />
        )}
      </button>
      {open && <div className="border-t border-[#2a2a2a] px-5 pb-6 pt-4">{children}</div>}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN CONTENT COMPONENT
   ═══════════════════════════════════════════════════════ */

export function EWLearnContent({ standalone = false }: { standalone?: boolean }) {
  const [open, setOpen] = useState<Record<number, boolean>>({ 1: true });

  const toggle = useCallback((n: number) => {
    setOpen((prev) => ({ ...prev, [n]: !prev[n] }));
  }, []);

  const scrollTo = useCallback(
    (n: number) => {
      setOpen((prev) => ({ ...prev, [n]: true }));
      setTimeout(() => {
        document.getElementById(`module-${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    },
    []
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <section>
        {!standalone && (
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-[#a0a0a0] transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Scanner
          </Link>
        )}
        <div className="flex items-center gap-3">
          <BookOpen className="h-8 w-8 text-[#5ba3e6]" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Elliott Wave Guide
            </h1>
            <p className="mt-1 text-[#a0a0a0]">
              A progressive guide from first principles to professional-grade analysis. Work through it in order.
            </p>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* ── Sidebar TOC ── */}
        <aside className="w-full shrink-0 lg:sticky lg:top-20 lg:h-fit lg:w-56">
          {/* Mobile: horizontal scroll */}
          <div className="flex gap-2 overflow-x-auto pb-2 lg:hidden">
            {MODULES.map((m) => (
              <button
                key={m.n}
                onClick={() => scrollTo(m.n)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  open[m.n]
                    ? "bg-[#185FA5]/20 text-[#5ba3e6] ring-1 ring-[#185FA5]"
                    : "bg-[#262626] text-[#a0a0a0] hover:text-white"
                }`}
              >
                {m.n}. {m.title}
              </button>
            ))}
          </div>

          {/* Desktop: vertical sidebar */}
          <nav className="hidden space-y-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-3 lg:block">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[#666]">Modules</p>
            {MODULES.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.n}
                  onClick={() => scrollTo(m.n)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                    open[m.n]
                      ? "bg-[#185FA5]/15 text-[#5ba3e6]"
                      : "text-[#a0a0a0] hover:bg-[#262626] hover:text-white"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{m.n}. {m.title}</span>
                </button>
              );
            })}
            <div className="my-2 border-t border-[#2a2a2a]" />
            <button
              onClick={() => {
                document.getElementById("quick-ref")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-[#a0a0a0] hover:bg-[#262626] hover:text-white"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Quick Reference
            </button>
          </nav>
        </aside>

        {/* ── Main Content ── */}
        <main className="min-w-0 flex-1 space-y-4">
          {/* =============== MODULE 1 — FOUNDATIONS =============== */}
          <ModuleShell n={1} open={!!open[1]} toggle={toggle}>
            <SectionH3>1.1 What Elliott Wave Theory Says</SectionH3>
            <Prose>
              <p>
                Markets move in repeating <strong className="text-white">8-wave cycles</strong> driven
                by crowd psychology: a 5-wave <em>impulse</em> in the direction of the trend, followed
                by a 3-wave <em>correction</em> against it.
              </p>
            </Prose>
            <Mono>
              Impulse (trend): &nbsp;&nbsp;&nbsp;&nbsp;1 — 2 — 3 — 4 — 5<br />
              Correction: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;A — B — C
            </Mono>
            <Prose>
              <p>
                This pattern is <strong className="text-white">fractal</strong> — it repeats at every
                timeframe, from monthly charts down to one-minute bars.
              </p>
            </Prose>

            <WaveCycleDiagram />

            <SectionH3>1.2 The 5-Wave Impulse</SectionH3>
            <DataTable
              headers={["Wave", "Character"]}
              rows={[
                ["1", "Initial move; often unnoticed, looks like noise"],
                ["2", "Retraces wave 1 (typically 50–61.8%); never retraces 100%"],
                ["3", "The powerhouse — usually longest, strongest, never the shortest"],
                ["4", "Sideways/shallow pullback (typically 23.6–38.2% of wave 3)"],
                ["5", "Final push; often weaker momentum than wave 3 (divergence)"],
              ]}
            />

            <SectionH3>1.3 The 3-Wave Correction</SectionH3>
            <DataTable
              headers={["Wave", "Character"]}
              rows={[
                ["A", "First move against the prior trend"],
                ["B", "Counter-rally (often traps traders thinking trend resumed)"],
                ["C", "Final leg; typically equal to wave A or 1.618× wave A"],
              ]}
            />

            <SectionH3>1.4 The Three Unbreakable Rules</SectionH3>
            <Callout type="rule">
              <ol className="list-inside list-decimal space-y-2 text-sm text-[#e6e6e6]">
                <li>Wave 2 <strong>never</strong> retraces more than 100% of wave 1</li>
                <li>Wave 3 is <strong>never</strong> the shortest of waves 1, 3, and 5</li>
                <li>Wave 4 <strong>never</strong> overlaps wave 1&apos;s price territory (in standard impulses)</li>
              </ol>
              <p className="mt-3 text-xs font-semibold text-[#5ba3e6]">
                If any rule breaks, your count is wrong. Recount.
              </p>
            </Callout>
          </ModuleShell>

          {/* =============== MODULE 2 — THE MATH =============== */}
          <ModuleShell n={2} open={!!open[2]} toggle={toggle}>
            <SectionH3>2.1 Fibonacci Retracements (where waves end)</SectionH3>
            <Prose>
              <p><strong className="text-white">Wave 2</strong> retracement of wave 1:</p>
            </Prose>
            <DataTable
              headers={["Depth", "Level", "Notes"]}
              rows={[
                ["Shallow", "38.2%", "Rare — suggests very strong trend"],
                ["Typical", "50% or 61.8%", "Most common wave 2 levels"],
                ["Deep", "78.6%", "Last-chance entry before invalidation"],
              ]}
            />
            <Prose>
              <p><strong className="text-white">Wave 4</strong> retracement of wave 3:</p>
            </Prose>
            <DataTable
              headers={["Depth", "Level", "Constraint"]}
              rows={[
                ["Typical", "23.6% or 38.2%", "Must stop above wave 1's peak (rule 3)"],
              ]}
            />

            <FibRetracementDiagram />

            <SectionH3>2.2 Fibonacci Projections (where waves go)</SectionH3>
            <Prose>
              <p><strong className="text-white">Wave 3</strong> projection from wave 2:</p>
            </Prose>
            <DataTable
              headers={["Type", "Ratio"]}
              rows={[
                ["Minimum", "1.618 × wave 1"],
                ["Common", "2.618 × wave 1"],
                ["Extended", "4.236 × wave 1"],
              ]}
            />
            <Prose>
              <p><strong className="text-white">Wave 5</strong> projection — three methods, use them together:</p>
              <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
                <li>Equal to wave 1 (common when wave 3 extended)</li>
                <li>0.618 × the net distance of waves 1–3</li>
                <li>1.618 × wave 1 (when wave 5 itself extends)</li>
              </ul>
              <p className="mt-3"><strong className="text-white">Correction targets:</strong></p>
              <ul className="list-inside list-disc space-y-1 text-[#c0c0c0]">
                <li>Zigzag wave C: 1.0 or 1.618 × wave A</li>
                <li>Flat wave C: 1.0 or 1.382 × wave A</li>
              </ul>
            </Prose>

            <SectionH3>2.3 The Confluence Method</SectionH3>
            <Callout type="info">
              <p className="text-sm text-[#e6e6e6]">
                Draw all three projections for your target wave. Where <strong>two or more cluster</strong>,
                that&apos;s your high-probability reversal zone. Combine with prior structural support/resistance
                for confluence.
              </p>
            </Callout>
          </ModuleShell>

          {/* =============== MODULE 3 — READING CORRECTIONS =============== */}
          <ModuleShell n={3} open={!!open[3]} toggle={toggle}>
            <SectionH3>3.1 Identify the First Leg</SectionH3>
            <Callout type="info">
              <p className="text-sm text-[#e6e6e6]">
                <strong>5-wave first leg</strong> → you&apos;re in a <strong>zigzag</strong><br />
                <strong>3-wave first leg</strong> → you&apos;re in a <strong>flat or triangle</strong>
              </p>
            </Callout>

            <SectionH3>3.2 The Three Correction Families</SectionH3>
            <CorrectionPatternsDiagram />

            <Prose>
              <p>
                <strong className="text-[#5ba3e6]">Zigzag (5-3-5)</strong> — Sharp, trending correction.
                Wave C usually equals wave A or extends to 1.618× A. Common in wave 2 positions.
              </p>
              <p>
                <strong className="text-[#5ba3e6]">Flat (3-3-5)</strong> — Sideways correction with three sub-variants:
              </p>
            </Prose>
            <DataTable
              headers={["Variant", "Wave B", "Wave C", "Frequency"]}
              rows={[
                ["Regular flat", "≈ 90–100% of A", "≈ A", "Common"],
                ["Expanded flat", "> 100% of A", "Extends beyond A", "Very common in wave 4"],
                ["Running flat", "> 100% of A (like expanded)", "Fails to reach end of A", "Rare — strong underlying trend"],
              ]}
            />
            <Prose>
              <p>
                <strong className="text-[#5ba3e6]">Triangle (3-3-3-3-3)</strong> — Five overlapping legs
                (A-B-C-D-E), each a 3-wave move, contracting into an apex. Almost always appears in
                wave 4 or wave B, <strong className="text-white">never in wave 2</strong>. Breakout
                direction matches the prior trend.
              </p>
              <p>
                <strong className="text-[#5ba3e6]">Combinations (W-X-Y or W-X-Y-X-Z)</strong> — Two or
                three corrective patterns linked by X waves. Appear when price needs to consume time
                rather than distance.
              </p>
            </Prose>

            <SectionH3>3.3 Real-Time Correction Checklist</SectionH3>
            <Callout type="info">
              <ol className="list-inside list-decimal space-y-2 text-sm text-[#e6e6e6]">
                <li>Is the first leg impulsive (5) or corrective (3)?</li>
                <li>Is wave B retracing deeply (&gt;61.8% → flat) or shallowly (&lt;61.8% → zigzag)?</li>
                <li>Are legs overlapping heavily? → triangle</li>
                <li>Is momentum weakening progressively? → correction nearing end</li>
              </ol>
            </Callout>
          </ModuleShell>

          {/* =============== MODULE 4 — WAVE 3 VS WAVE 5 =============== */}
          <ModuleShell n={4} open={!!open[4]} toggle={toggle}>
            <Callout type="warn">
              <p className="text-sm font-semibold text-amber-200">
                The single most valuable skill in Elliott analysis. Wave 3s are where money is made.
                Wave 5s are where it&apos;s lost.
              </p>
            </Callout>

            <SectionH3>4.1 Wave 3 Fingerprints</SectionH3>
            <Prose>
              <ul className="list-inside list-disc space-y-1.5">
                <li>Strongest momentum reading of the entire sequence (RSI, MACD at extremes)</li>
                <li>Highest volume</li>
                <li>Gaps in the direction of the trend (breakaway or measuring gaps)</li>
                <li>News catches up to price; fundamentals &quot;suddenly&quot; look great</li>
                <li>Breadth confirms (most stocks participating)</li>
                <li>No divergences on oscillators</li>
              </ul>
            </Prose>

            <SectionH3>4.2 Wave 5 Fingerprints</SectionH3>
            <Prose>
              <ul className="list-inside list-disc space-y-1.5">
                <li><strong className="text-white">Momentum diverges</strong> — price makes a new high, RSI/MACD does not</li>
                <li>Volume lower than wave 3</li>
                <li>Breadth narrows — fewer stocks making new highs</li>
                <li>Sentiment euphoric; retail FOMO peaks</li>
                <li>Often forms an ending diagonal (wedge pattern with overlapping waves)</li>
                <li>Terminal &quot;throwover&quot; above trendline, then sharp reversal</li>
              </ul>
            </Prose>

            <SectionH3>4.3 The &quot;Third of a Third&quot; Principle</SectionH3>
            <Callout type="rule">
              <p className="text-sm text-[#e6e6e6]">
                The middle of wave 3 (<strong>wave 3 of wave 3</strong> at any degree) is the most
                violent, most directional point in any impulse. If price is accelerating with no
                divergence, you&apos;re probably there. <strong className="text-[#22c55e]">Stay in the trade.</strong>
              </p>
            </Callout>
          </ModuleShell>

          {/* =============== MODULE 5 — ADVANCED PATTERNS =============== */}
          <ModuleShell n={5} open={!!open[5]} toggle={toggle}>
            <SectionH3>5.1 Diagonals (Wedge Impulses)</SectionH3>
            <Prose>
              <p>
                Diagonals are wedge-shaped 5-wave patterns where rules bend slightly. They appear in
                specific positions only.
              </p>
            </Prose>

            <DiagonalDiagram />

            <DataTable
              headers={["Type", "Position", "Sub-waves", "Signal"]}
              rows={[
                ["Leading diagonal", "Wave 1 or wave A of zigzag", "5-3-5-3-5", "Start of a new trend"],
                ["Ending diagonal", "Wave 5 or wave C", "3-3-3-3-3", "Trend is exhausted"],
              ]}
            />
            <Prose>
              <p>
                Both types: 5 waves (1-2-3-4-5), wave 4 overlaps wave 1 (the only impulse where this
                is allowed), converging trendlines, each wave typically shorter than the previous.
              </p>
            </Prose>
            <Callout type="info">
              <p className="text-sm text-[#e6e6e6]">
                <strong>Trading ending diagonals:</strong> wait for the throwover above the upper
                trendline, then a reversal back inside — that&apos;s your entry. Stop just beyond the
                throwover. Target: the start of the diagonal. Reversals are violent.
              </p>
            </Callout>

            <SectionH3>5.2 Extensions</SectionH3>
            <Prose>
              <p>
                In any impulse, one of waves 1, 3, or 5 typically <strong className="text-white">extends</strong> — meaning
                it&apos;s noticeably longer with clearly visible internal sub-waves.
              </p>
            </Prose>
            <DataTable
              headers={["Extension", "Frequency", "Key Trait"]}
              rows={[
                ["Wave 3 (~60%)", "Most common", "Textbook impulse. Waves 1 and 5 roughly equal."],
                ["Wave 5 (~30%)", "Common in commodities", "Blow-off top. Post-impulse correction retraces deeply (to wave 2 of the extended 5th). Tighten stops."],
                ["Wave 1 (~10%)", "Rare", "First wave is strongest. Often seen off major bear-market lows."],
              ]}
            />
            <Callout type="info">
              <p className="text-sm text-[#e6e6e6]">
                <strong>Practical use:</strong> After wave 3, measure it against wave 1.<br />
                If wave 3 &lt; 1.618 × wave 1 → suspect wave 5 will extend.<br />
                If wave 3 &gt; 2.618 × wave 1 → wave 3 was the extension; expect a subdued wave 5.
              </p>
            </Callout>

            <SectionH3>5.3 Truncations (Failed Fifths)</SectionH3>
            <Prose>
              <p>
                A truncation is when wave 5 fails to exceed the end of wave 3 — price makes a lower
                high in an uptrend before reversing. Signals extreme underlying weakness.
              </p>
              <p><strong className="text-white">Fingerprints:</strong></p>
              <ul className="list-inside list-disc space-y-1.5">
                <li>Wave 3 was unusually strong / extended</li>
                <li>Wave 4 was sharp and deep</li>
                <li>Severe momentum divergence on wave 5</li>
                <li>Wave 5 still completes a full 5-wave structure internally — it just falls short</li>
              </ul>
            </Prose>
            <Callout type="warn">
              <p className="text-sm text-amber-200">
                <strong>Trading:</strong> Entry on break of wave 4&apos;s low (uptrend truncation). Stop above
                wave 5&apos;s high. Targets are aggressive — these reversals run.
              </p>
            </Callout>
          </ModuleShell>

          {/* =============== MODULE 6 — MULTI-TIMEFRAME =============== */}
          <ModuleShell n={6} open={!!open[6]} toggle={toggle}>
            <Callout type="warn">
              <p className="text-sm text-amber-200">
                This is where amateurs get destroyed and professionals separate themselves.
              </p>
            </Callout>

            <SectionH3>6.1 The Nine Degrees of Trend</SectionH3>
            <DataTable
              headers={["Degree", "Duration", "Notation"]}
              rows={[
                ["Grand Supercycle", "Multi-century", "Ⓘ ⒾⒾ ⒾⒾⒾ"],
                ["Supercycle", "Decades", "(I) (II) (III)"],
                ["Cycle", "Years", "I II III"],
                ["Primary", "Months–years", "① ② ③"],
                ["Intermediate", "Weeks–months", "(1) (2) (3)"],
                ["Minor", "Weeks", "1 2 3"],
                ["Minute", "Days", "(i) (ii) (iii)"],
                ["Minuette", "Hours", "i ii iii"],
                ["Subminuette", "Minutes", "small letters"],
              ]}
            />

            <SectionH3>6.2 Why Degree Matters</SectionH3>
            <WaveNestingDiagram />
            <Prose>
              <p>
                Every wave is made of smaller waves. A Primary wave 3 contains five Intermediate waves.
                Each Intermediate wave 3 contains five Minor waves. And so on.
              </p>
            </Prose>
            <Callout type="warn">
              <p className="text-sm text-amber-200">
                <strong>Degree mismatch</strong> is the #1 source of bad counts. If you&apos;re counting a
                &quot;wave 5 top&quot; on a 5-minute chart, you&apos;re probably looking at a subwave of a larger
                wave 3 with much further to run.
              </p>
            </Callout>

            <SectionH3>6.3 Top-Down Workflow</SectionH3>
            <DataTable
              headers={["Step", "Chart", "Purpose"]}
              rows={[
                ["1", "Weekly", "Identify the largest trend. Wave 3 (extended ahead) or wave 5 (ending)?"],
                ["2", "Daily", "Zoom into the current subwave. This is your \"working degree.\""],
                ["3", "4H / Hourly", "Look for subwaves of the daily count. Entries live here."],
                ["4", "15-minute", "Fine-tune stops and scaling. Don't count here unless scalping."],
              ]}
            />

            <SectionH3>6.4 The Golden Rule</SectionH3>
            <Callout type="rule">
              <p className="mb-3 text-base font-bold text-[#5ba3e6]">
                Trade the working degree, confirm with the higher, time with the lower.
              </p>
              <p className="text-sm text-[#e6e6e6]">
                Before every trade, run the three-chart check:
              </p>
              <ol className="mt-2 list-inside list-decimal space-y-1.5 text-sm text-[#e6e6e6]">
                <li>What degree am I trading? (Define it explicitly.)</li>
                <li>Does the degree above support my direction?</li>
                <li>Does the degree below show a completed pattern triggering entry now?</li>
              </ol>
              <p className="mt-3 text-xs font-semibold text-[#22c55e]">
                If all three align → take the trade. If any conflict → pass.
              </p>
            </Callout>
          </ModuleShell>

          {/* =============== MODULE 7 — TRADING APPLICATION =============== */}
          <ModuleShell n={7} open={!!open[7]} toggle={toggle}>
            <SectionH3>7.1 The Highest-Probability Setups</SectionH3>
            <DataTable
              headers={["Setup", "Entry", "Stop", "Target", "R:R"]}
              rows={[
                ["Wave 2 entry", "50–61.8% retrace of wave 1", "Below wave 1's start", "Wave 3 extension", "1:3+"],
                ["Wave 4 entry", "38.2% retrace of wave 3", "Below wave 1's peak", "Wave 5 projection", "1:2"],
                ["End-of-C entry", "C reaches 1.0 or 1.618 × A + divergence", "Beyond Fib extension", "New impulse", "1:3+"],
              ]}
            />
            <Callout type="info">
              <p className="text-sm text-[#e6e6e6]">
                The <strong>wave 2 entry</strong> is the best Elliott setup, period. Risk/reward
                often 1:3 or better because you&apos;re entering before the strongest wave (wave 3).
              </p>
            </Callout>

            <SectionH3>7.2 Stop Placement (Hard Rules)</SectionH3>
            <DataTable
              headers={["Position", "Stop Location", "If Broken"]}
              rows={[
                ["Long in wave 3", "Below wave 2 low", "Count is wrong"],
                ["Long in wave 5", "Below wave 4 low", "Count is wrong"],
                ["Short in wave C", "Above wave B high", "Count is wrong"],
              ]}
            />

            <SectionH3>7.3 Position Management</SectionH3>
            <Prose>
              <ol className="list-inside list-decimal space-y-2">
                <li><strong className="text-white">Scale in</strong> at Fib clusters, not single levels</li>
                <li><strong className="text-white">Move stop to breakeven</strong> once wave 3 breaks above wave 1&apos;s peak</li>
                <li><strong className="text-white">Take partial profits</strong> at wave 3&apos;s minimum target (1.618 × wave 1)</li>
                <li><strong className="text-white">Exit fully</strong> on wave 5 divergence or trendline break</li>
              </ol>
            </Prose>

            <SectionH3>7.4 The Invalidation Mindset</SectionH3>
            <Callout type="warn">
              <p className="text-sm text-amber-200">
                Every count has a price level that proves it wrong. <strong>Know that level before
                entering.</strong> When it breaks, exit immediately — don&apos;t argue with the chart.
              </p>
            </Callout>

            <SectionH3>7.5 The Alternate Count Discipline</SectionH3>
            <Prose>
              <p>
                Always maintain a <strong className="text-white">primary count</strong> and an{" "}
                <strong className="text-white">alternate</strong>. If the primary invalidates, the alternate
                should already tell you what&apos;s happening. Analysts who marry one count get destroyed
                in corrections.
              </p>
            </Prose>
          </ModuleShell>

          {/* =============== MODULE 8 — MINDSET =============== */}
          <ModuleShell n={8} open={!!open[8]} toggle={toggle}>
            <Prose>
              <p>
                Elliott Wave is <strong className="text-white">probabilistic, not deterministic</strong>.
                The patterns recur because of crowd psychology — but any single count can fail.
              </p>
            </Prose>

            <SectionH3>Three Principles to Internalize</SectionH3>
            <div className="my-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#5ba3e6]">1. Market Authority</p>
                <p className="text-sm text-[#c0c0c0]">
                  The market is the final authority. Your count is a hypothesis, not a prediction.
                </p>
              </div>
              <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#5ba3e6]">2. Asymmetric Sizing</p>
                <p className="text-sm text-[#c0c0c0]">
                  Size positions so being wrong costs little and being right pays well. The math does the rest.
                </p>
              </div>
              <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#5ba3e6]">3. Patience Compounds</p>
                <p className="text-sm text-[#c0c0c0]">
                  Most setups are noise. The ones where multiple degrees align, Fibonacci levels cluster,
                  and momentum confirms are rare — and they pay for the waiting.
                </p>
              </div>
            </div>
          </ModuleShell>

          {/* =============== MODULE 9 — CHANNELING & GUIDELINES =============== */}
          <ModuleShell n={9} open={!!open[9]} toggle={toggle}>
            <SectionH3>9.1 The Channeling Technique</SectionH3>
            <Prose>
              <p>
                Parallel channels are one of the most <strong className="text-white">actionable</strong> tools
                in EW. They project where waves will end before they get there.
              </p>
            </Prose>

            <ChannelingDiagram />

            <Prose>
              <p><strong className="text-[#f59e0b]">Base Channel</strong> (early trend):</p>
              <ol className="list-inside list-decimal space-y-1.5">
                <li>Draw a line from the start of wave 1 (point 0) through the end of wave 2</li>
                <li>Draw a parallel line through the peak of wave 1</li>
                <li>Wave 3 should <strong className="text-white">overshoot</strong> the upper line — if it doesn&apos;t, the move may not be a wave 3</li>
              </ol>
              <p className="mt-3"><strong className="text-[#22c55e]">Acceleration Channel</strong> (mature trend):</p>
              <ol className="list-inside list-decimal space-y-1.5">
                <li>Draw a line from wave 2&apos;s end through wave 4&apos;s end</li>
                <li>Draw a parallel line through wave 3&apos;s peak</li>
                <li>The upper parallel <strong className="text-white">projects wave 5&apos;s target zone</strong></li>
                <li>Price touching or slightly overshooting this line is a common wave 5 termination point</li>
              </ol>
            </Prose>

            <Callout type="info">
              <p className="text-sm text-[#e6e6e6]">
                <strong>Pro tip:</strong> If wave 5 fails to reach the upper acceleration channel, suspect a
                truncation. If it throws over aggressively, suspect an ending diagonal with reversal imminent.
              </p>
            </Callout>

            <SectionH3>9.2 The Alternation Guideline</SectionH3>
            <Prose>
              <p>
                If wave 2 and wave 4 are both corrections within the same impulse, they tend to
                <strong className="text-white"> alternate in form</strong>:
              </p>
            </Prose>
            <DataTable
              headers={["Wave 2 Type", "Wave 4 Tends To Be", "Logic"]}
              rows={[
                ["Sharp (zigzag)", "Flat or triangle (sideways)", "Market alternates between panic and consolidation"],
                ["Flat (sideways)", "Sharp (zigzag)", "After grinding sideways, the next pullback is decisive"],
                ["Simple pattern", "Complex pattern", "Single zigzag vs. combination (W-X-Y)"],
                ["Deep retrace (61.8%+)", "Shallow retrace (23.6–38.2%)", "Price alternates depth of pullbacks"],
              ]}
            />
            <Callout type="warn">
              <p className="text-sm text-amber-200">
                Alternation is a <strong>guideline</strong>, not a rule — it doesn&apos;t always hold. But when
                wave 2 was a sharp zigzag (which is most common), expecting wave 4 to be a flat
                or triangle has a strong hit rate.
              </p>
            </Callout>

            <SectionH3>9.3 Guideline of Proportionality</SectionH3>
            <Prose>
              <p>
                Corrective waves should be <strong className="text-white">proportional in both price
                and time</strong> to the impulse they correct:
              </p>
              <ul className="list-inside list-disc space-y-1.5">
                <li>If wave 1 took 3 weeks and retraced 200 points, wave 2 shouldn&apos;t take 6 months to retrace 50 points — the proportions are wrong</li>
                <li>Wave 4 typically takes <strong className="text-white">equal or more time</strong> than wave 2 (price consumed time instead of distance)</li>
                <li>Corrections at the same degree should be roughly proportional to each other</li>
                <li>If your correction looks tiny compared to the impulse it&apos;s correcting, you probably have the degree wrong — it&apos;s likely a sub-wave correction, not the full corrective wave</li>
              </ul>
            </Prose>
            <Callout type="rule">
              <p className="text-sm text-[#e6e6e6]">
                <strong>The right-look principle:</strong> A correct wave count should look
                &quot;balanced&quot; — waves proportional in size and duration. If the count looks
                forced or aesthetically wrong, it probably is wrong.
              </p>
            </Callout>

            <SectionH3>9.4 Guideline of Equality</SectionH3>
            <Prose>
              <p>
                Two of the three impulse waves (1, 3, 5) tend toward <strong className="text-white">equality
                in length</strong>. In practice:
              </p>
              <ul className="list-inside list-disc space-y-1.5">
                <li>When wave 3 extends (most common): <strong className="text-white">wave 1 ≈ wave 5</strong> in price distance</li>
                <li>When wave 5 extends: waves 1 and 3 are roughly equal</li>
                <li>When wave 1 extends (rare): waves 3 and 5 tend toward equality</li>
              </ul>
              <p className="mt-2">
                This gives you a <strong className="text-white">wave 5 price target</strong> before it begins:
                measure wave 1&apos;s length and project it from wave 4&apos;s end.
              </p>
            </Prose>
          </ModuleShell>

          {/* =============== MODULE 10 — WAVE PERSONALITY & VOLUME =============== */}
          <ModuleShell n={10} open={!!open[10]} toggle={toggle}>
            <SectionH3>10.1 Wave Personality</SectionH3>
            <Prose>
              <p>
                Each wave has a distinct <strong className="text-white">character</strong> in terms of sentiment,
                news flow, and market behavior. Learning these personalities lets you identify waves
                in real time without perfect structure.
              </p>
            </Prose>
            <DataTable
              headers={["Wave", "Personality", "Sentiment / News"]}
              rows={[
                ["1", "Hesitant, low-conviction rally. Often mistaken for a bear market bounce. Narrow participation — few believers.", "Still bearish. Media calls it a dead-cat bounce. Short-sellers add positions."],
                ["2", "Fear returns. Feels like the downtrend is resuming. Deep retrace shakes out early longs.", "Bad news resurfaces. \"See? I told you it wasn't over.\" Short interest rises again."],
                ["3", "Explosive. Broadening participation, gaps up, breakouts everywhere. This is the recognition wave.", "Fundamentals improve. Upgrades pour in. Media turns bullish. The crowd finally agrees with the trend."],
                ["4", "Grinding, frustrating, choppy. Often goes sideways in a complex correction. Traders get bored or whipsawed.", "No new bad news — just indecision. \"Healthy consolidation\" narrative. Volatility drops."],
                ["5", "Final push. Fewer stocks participating. Momentum diverges. Euphoria. This is where retail piles in.", "All-time bullish sentiment. IPO frenzy. Media declares new paradigm. \"This time it's different.\""],
                ["A", "Sharp decline, but most think it's just a pullback. \"Buy the dip\" mentality dominates.", "News remains positive. Analysts say correction is healthy. Dip-buyers emerge."],
                ["B", "The trap. Rally feels real — can retrace deeply. Sucks in the last remaining bulls.", "Media says the correction is over. Short-term momentum looks bullish. Maximum deception."],
                ["C", "Relentless decline. No bounces hold. Margin calls. Panic. This is wave 3's mirror image.", "Capitulation. Downgrades. \"Sell everything.\" Retail exits at the bottom."],
              ]}
            />

            <SectionH3>10.2 Volume Patterns Across the Impulse</SectionH3>
            <VolumePatternDiagram />
            <DataTable
              headers={["Wave", "Typical Volume", "What It Means"]}
              rows={[
                ["1", "Light to moderate", "Few participants recognize the new trend; institutional accumulation hidden"],
                ["2", "Declining", "Selling pressure dries up — bears are running out of conviction"],
                ["3", "Highest of the impulse", "Broad participation. Confirms this is the real move. Breakaway gaps on heavy volume."],
                ["4", "Low / drying up", "Lack of interest. Consolidation. Thin trading often produces choppy corrections."],
                ["5", "Lower than wave 3", "This is the divergence signal. Price makes a new high on declining volume → exhaustion."],
              ]}
            />
            <Callout type="rule">
              <p className="text-sm text-[#e6e6e6]">
                <strong>Volume divergence</strong> between waves 3 and 5 is one of the most reliable
                confirmations that wave 5 is the final wave. When price hits a new high on lower volume,
                start looking for exits — not entries.
              </p>
            </Callout>

            <SectionH3>10.3 Indicators That Confirm Wave Counts</SectionH3>
            <DataTable
              headers={["Indicator", "Wave 3 Signal", "Wave 5 Signal", "Correction Signal"]}
              rows={[
                ["RSI (14)", "Makes highest reading of the impulse (often >70)", "Diverges — lower high on RSI despite higher price high", "Oversold in wave C (<30), often with positive divergence at the end"],
                ["MACD", "Histogram at peak; zero-line crossover on W1→W3", "Histogram lower peak than W3 (classic divergence)", "Histogram returns to zero at end of correction"],
                ["Breadth (A/D line)", "New highs across sectors; A/D line confirms", "Fewer stocks at new highs; A/D diverges", "Breadth washes out in wave C — capitulation readings"],
                ["OBV", "Rising strongly — volume confirms price direction", "Flat or declining while price rises — distribution", "Declining in A/C, may diverge at C's end"],
              ]}
            />
            <Callout type="info">
              <p className="text-sm text-[#e6e6e6]">
                <strong>Key principle:</strong> Indicators don&apos;t replace wave counting — they
                <em> confirm</em> it. Use them to distinguish between wave 3 and wave 5 when the
                structure alone is ambiguous. Multiple indicator divergences at a new price high
                is the strongest wave 5 termination signal.
              </p>
            </Callout>
          </ModuleShell>

          {/* =============== MODULE 11 — PRACTICAL COUNTING =============== */}
          <ModuleShell n={11} open={!!open[11]} toggle={toggle}>
            <SectionH3>11.1 Step-by-Step Wave Counting Process</SectionH3>
            <Prose>
              <p>
                Here is a repeatable process for counting waves on any chart. Follow these steps
                in order every time.
              </p>
            </Prose>
            <div className="my-4 space-y-3">
              {[
                { step: "1", title: "Zoom out — establish the big picture", desc: "Open the weekly or monthly chart. Identify the largest clear impulse or correction you can see. Which wave of the higher degree are we in? Don't start counting sub-waves until you know this." },
                { step: "2", title: "Find the most obvious wave 3", desc: "Wave 3 is usually the easiest to spot — it's the longest, steepest move with the highest volume. Label it first. Everything else is relative to it." },
                { step: "3", title: "Work backward from wave 3", desc: "Identify wave 1 (the first impulsive move before wave 3) and wave 2 (the correction between them). Check: does wave 2 retrace less than 100% of wave 1? Does wave 3 break beyond wave 1's end?" },
                { step: "4", title: "Work forward from wave 3", desc: "Identify wave 4 (the correction after wave 3) and wave 5 (the final push). Check: does wave 4 stay above wave 1's territory? Is wave 3 not the shortest? Does wave 5 show divergence?" },
                { step: "5", title: "Verify the three rules", desc: "W2 < 100% of W1? W3 not shortest? W4 above W1 peak? If any fail, your labels are wrong — try an alternate count." },
                { step: "6", title: "Check proportionality and alternation", desc: "Do waves 2 and 4 alternate in form? Are waves proportional in time and price? Does the count have the 'right look'?" },
                { step: "7", title: "Drop to the lower timeframe", desc: "Zoom into the current wave and count its internal structure. Confirm it has the right number of sub-waves (5 for impulse waves, 3 for corrections)." },
                { step: "8", title: "Identify your location and plan", desc: "Now that you know where you are in the cycle, determine: Am I early enough to enter (waves 1-2 setup)? Should I hold (mid wave 3)? Should I take profits (wave 5 divergence)? Should I reverse (completed pattern)?" },
              ].map((item) => (
                <div key={item.step} className="flex gap-3 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#185FA5]/20 text-xs font-bold text-[#5ba3e6]">
                    {item.step}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#a0a0a0]">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <SectionH3>11.2 Common Mistakes</SectionH3>
            <Prose>
              <p>These are the errors that cost beginners the most money and frustration:</p>
            </Prose>
            <DataTable
              headers={["Mistake", "Why It Happens", "How to Fix It"]}
              rows={[
                ["Forcing counts to fit a bias", "You want to be long so you label every dip as wave 2, ignoring evidence of a larger correction", "Always maintain an alternate count. If you catch yourself only seeing bullish counts, deliberately draw the bearish one."],
                ["Confusing rules and guidelines", "Treating alternation or equality as absolute rules, or ignoring actual rules like W4/W1 overlap", "Only three things are rules (Module 1.4). Everything else is a guideline — helpful but breakable."],
                ["Counting the wrong degree", "Labeling a subminuette wave on a 5-min chart as a Primary wave top", "Start on the weekly chart and work down. Every sub-wave label must nest correctly within the higher degree."],
                ["No alternate count", "100% committed to one count; when it fails, you freeze or panic", "Before entering any trade, write down: 'If price breaks X, the alternate count is Y and I will do Z.'"],
                ["Over-counting on low timeframes", "Trying to label every tick on a 1-minute chart leads to noise-driven false patterns", "Don't count below the 15-minute chart unless you're scalping. Noise overwhelms structure below that."],
                ["Ignoring volume and momentum", "Perfect-looking 5-wave structure that's actually part of a larger correction", "Always cross-check with RSI/MACD divergence and volume patterns. Structure alone isn't enough."],
                ["Premature wave 5 calls", "Labeling wave 3 as wave 5 because it's 'gone far enough'", "Wave 3 doesn't end because it looks extended — check for momentum divergence. If RSI is still making new highs, it's probably still wave 3."],
                ["Entering wave B traps", "Wave B of a correction rallies hard and looks like a new impulse", "Check the structure: if the rally is 3 waves (not 5), it's corrective. Volume in wave B is usually lighter than the prior impulse."],
              ]}
            />

            <SectionH3>11.3 When to Recount</SectionH3>
            <Callout type="warn">
              <p className="text-sm text-amber-200">
                Don&apos;t fall in love with your count. Recount immediately when:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm text-[#e6e6e6]">
                <li>Any of the three rules breaks</li>
                <li>Price action completely deviates from your projected path with no recovery</li>
                <li>Volume and momentum tell a fundamentally different story than your labels</li>
                <li>Your &quot;wave 3&quot; has lower momentum than your &quot;wave 1&quot;</li>
                <li>You need to invoke increasingly complex patterns (triple zigzags, running flats) to keep your count alive — simplicity is usually right</li>
              </ul>
            </Callout>

            <SectionH3>11.4 The 80/20 of Wave Counting</SectionH3>
            <Callout type="rule">
              <p className="text-sm text-[#e6e6e6]">
                You don&apos;t need to label every wave perfectly. Focus on the two things that matter most:
              </p>
              <ol className="mt-2 list-inside list-decimal space-y-2 text-sm text-[#e6e6e6]">
                <li><strong>Is the larger trend impulsive or corrective?</strong> If impulsive, trade with it. If corrective, wait for it to end or trade the structure.</li>
                <li><strong>Where am I in the cycle?</strong> Early (waves 1-2 = low risk entry), middle (wave 3 = hold and add), or late (wave 5 = take profits and tighten stops)?</li>
              </ol>
              <p className="mt-3 text-xs text-[#5ba3e6]">
                Get these two questions right and you&apos;ll outperform most traders — even if your
                sub-wave labels are imperfect.
              </p>
            </Callout>
          </ModuleShell>

          {/* =============== QUICK REFERENCE CARD =============== */}
          <section id="quick-ref" className="scroll-mt-20">
            <div className="rounded-xl border border-[#185FA5]/30 bg-[#185FA5]/5 p-6">
              <h2 className="mb-5 flex items-center gap-2 text-xl font-bold text-white">
                <AlertTriangle className="h-5 w-5 text-[#5ba3e6]" />
                Quick Reference Card
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Rules */}
                <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#ef4444]">
                    Rules (never broken)
                  </p>
                  <ul className="space-y-1.5 text-sm text-[#c0c0c0]">
                    <li>Wave 2 ≤ 100% of wave 1</li>
                    <li>Wave 3 is never shortest</li>
                    <li>Wave 4 doesn&apos;t overlap wave 1</li>
                  </ul>
                </div>

                {/* Ratios */}
                <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#5ba3e6]">
                    Most Common Ratios
                  </p>
                  <ul className="space-y-1.5 text-sm text-[#c0c0c0]">
                    <li>Wave 2: 50% or 61.8% of wave 1</li>
                    <li>Wave 3: 1.618 × wave 1</li>
                    <li>Wave 4: 38.2% of wave 3</li>
                    <li>Wave 5: equal to wave 1, or 0.618 × waves 1–3</li>
                  </ul>
                </div>

                {/* Pattern positions */}
                <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#22c55e]">
                    Pattern Positions
                  </p>
                  <ul className="space-y-1.5 text-sm text-[#c0c0c0]">
                    <li>Triangles → wave 4 or wave B (never wave 2)</li>
                    <li>Ending diagonals → wave 5 or wave C</li>
                    <li>Leading diagonals → wave 1 or wave A</li>
                    <li>Truncations → after extended wave 3</li>
                  </ul>
                </div>

                {/* Three-chart check */}
                <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#f59e0b]">
                    Three-Chart Check (Before Every Trade)
                  </p>
                  <ol className="list-inside list-decimal space-y-1.5 text-sm text-[#c0c0c0]">
                    <li>What degree am I trading?</li>
                    <li>Does the higher degree confirm direction?</li>
                    <li>Does the lower degree trigger entry?</li>
                  </ol>
                </div>

                {/* Guidelines */}
                <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#a78bfa]">
                    Key Guidelines
                  </p>
                  <ul className="space-y-1.5 text-sm text-[#c0c0c0]">
                    <li>Alternation: W2 sharp → W4 flat (and vice versa)</li>
                    <li>Equality: 2 of 3 impulse waves tend equal</li>
                    <li>Proportionality: corrections match impulse in time/price</li>
                    <li>Channeling: W5 targets upper acceleration channel line</li>
                  </ul>
                </div>

                {/* Volume confirmation */}
                <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-cyan-400">
                    Volume / Momentum
                  </p>
                  <ul className="space-y-1.5 text-sm text-[#c0c0c0]">
                    <li>W3: highest volume + strongest RSI</li>
                    <li>W5: lower volume + RSI/MACD divergence</li>
                    <li>W-B trap: lighter volume than prior impulse</li>
                    <li>W-C end: oversold RSI + positive divergence</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
