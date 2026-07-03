"use client";

import { SidebarSection } from "@/components/sidebar-section";
import type { CopilotInput, Market, Session, BiasDirection } from "@/lib/tradingCopilot/types";
import { DEFAULT_COPILOT_INPUT } from "@/lib/tradingCopilot/types";
import { MOCK_PRESETS } from "@/lib/tradingCopilot/mockData";

interface CopilotInputFormProps {
  input: CopilotInput;
  onChange: (input: CopilotInput) => void;
  collapsed: Set<string>;
  toggleSection: (key: string) => void;
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs text-[#888] shrink-0">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded border border-[#333] bg-[#0f0f0f] px-2 py-1 text-xs text-white outline-none focus:border-[#5ba3e6] w-28"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs text-[#888] shrink-0">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step}
        min={min}
        className="rounded border border-[#333] bg-[#0f0f0f] px-2 py-1 text-xs text-white outline-none focus:border-[#5ba3e6] w-28 text-right"
      />
    </div>
  );
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-xs hover:bg-[#222] transition-colors"
    >
      <span className="text-[#888]">{label}</span>
      <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${
        value ? "bg-green-900/30 text-green-400" : "bg-[#222] text-[#555]"
      }`}>
        {value ? "YES" : "NO"}
      </span>
    </button>
  );
}

const MARKET_OPTIONS: { value: Market; label: string }[] = [
  { value: "ES", label: "ES" },
  { value: "NQ", label: "NQ" },
  { value: "MES", label: "MES" },
  { value: "MNQ", label: "MNQ" },
  { value: "SPY", label: "SPY" },
  { value: "QQQ", label: "QQQ" },
];

const SESSION_OPTIONS: { value: Session; label: string }[] = [
  { value: "london", label: "London" },
  { value: "ny_am", label: "NY AM" },
  { value: "ny_pm", label: "NY PM" },
  { value: "asian", label: "Asian" },
  { value: "pre_market", label: "Pre-Market" },
];

const BIAS_OPTIONS: { value: BiasDirection; label: string }[] = [
  { value: "bullish", label: "Bullish" },
  { value: "bearish", label: "Bearish" },
  { value: "neutral", label: "Neutral" },
];

export function CopilotInputForm({ input, onChange, collapsed, toggleSection }: CopilotInputFormProps) {
  const update = <K extends keyof CopilotInput>(key: K, value: CopilotInput[K]) => {
    onChange({ ...input, [key]: value });
  };

  return (
    <div className="space-y-3">
      {/* Presets */}
      <SidebarSection
        title="Presets"
        sectionKey="presets"
        collapsed={collapsed.has("presets")}
        onToggle={toggleSection}
      >
        <div className="space-y-1.5">
          {MOCK_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => onChange(p.input)}
              className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-2 text-left text-xs text-[#ccc] hover:border-[#5ba3e6] hover:text-white transition-colors"
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-[10px] text-[#666] mt-0.5">{p.description}</div>
            </button>
          ))}
          <button
            onClick={() => onChange(DEFAULT_COPILOT_INPUT)}
            className="w-full rounded-md border border-[#333] bg-[#0f0f0f] px-3 py-1.5 text-xs text-[#666] hover:text-white transition-colors"
          >
            Reset to Defaults
          </button>
        </div>
      </SidebarSection>

      {/* Market & Session */}
      <SidebarSection
        title="Market & Session"
        sectionKey="market"
        collapsed={collapsed.has("market")}
        onToggle={toggleSection}
      >
        <div className="space-y-2">
          <SelectField label="Market" value={input.market} options={MARKET_OPTIONS} onChange={(v) => update("market", v)} />
          <SelectField label="Session" value={input.session} options={SESSION_OPTIONS} onChange={(v) => update("session", v)} />
          <NumberField label="Price" value={input.currentPrice} onChange={(v) => update("currentPrice", v)} step={0.25} />
        </div>
      </SidebarSection>

      {/* HTF Bias */}
      <SidebarSection
        title="HTF Bias"
        sectionKey="htf"
        collapsed={collapsed.has("htf")}
        onToggle={toggleSection}
      >
        <div className="space-y-2">
          <SelectField label="Daily" value={input.dailyBias} options={BIAS_OPTIONS} onChange={(v) => update("dailyBias", v)} />
          <SelectField label="4H" value={input.fourHourBias} options={BIAS_OPTIONS} onChange={(v) => update("fourHourBias", v)} />
          <SelectField label="1H" value={input.oneHourBias} options={BIAS_OPTIONS} onChange={(v) => update("oneHourBias", v)} />
          <SelectField label="15M" value={input.fifteenMinBias} options={BIAS_OPTIONS} onChange={(v) => update("fifteenMinBias", v)} />
        </div>
      </SidebarSection>

      {/* PDA Levels */}
      <SidebarSection
        title="PDA Levels"
        sectionKey="pda"
        collapsed={collapsed.has("pda")}
        onToggle={toggleSection}
      >
        <div className="space-y-2">
          <NumberField label="PDA High" value={input.pdaHighLevel} onChange={(v) => update("pdaHighLevel", v)} step={0.25} />
          <NumberField label="PDA Low" value={input.pdaLowLevel} onChange={(v) => update("pdaLowLevel", v)} step={0.25} />
          <NumberField label="Nearest OB" value={input.nearestOBLevel} onChange={(v) => update("nearestOBLevel", v)} step={0.25} />
          <NumberField label="Nearest FVG" value={input.nearestFVGLevel} onChange={(v) => update("nearestFVGLevel", v)} step={0.25} />
        </div>
      </SidebarSection>

      {/* ICT Conditions */}
      <SidebarSection
        title="ICT Conditions"
        sectionKey="ict"
        collapsed={collapsed.has("ict")}
        onToggle={toggleSection}
      >
        <div className="space-y-1">
          <ToggleField label="Liquidity Sweep" value={input.liquiditySweep} onChange={(v) => update("liquiditySweep", v)} />
          <ToggleField label="MSS" value={input.mss} onChange={(v) => update("mss", v)} />
          <ToggleField label="Displacement" value={input.displacement} onChange={(v) => update("displacement", v)} />
          <ToggleField label="FVG Present" value={input.fvgPresent} onChange={(v) => update("fvgPresent", v)} />
          <ToggleField label="FVG Retest" value={input.fvgRetest} onChange={(v) => update("fvgRetest", v)} />
          <ToggleField label="In FVG" value={input.inFVG} onChange={(v) => update("inFVG", v)} />
          <ToggleField label="Breaker" value={input.breaker} onChange={(v) => update("breaker", v)} />
        </div>
      </SidebarSection>

      {/* Trade State */}
      <SidebarSection
        title="Trade State"
        sectionKey="state"
        collapsed={collapsed.has("state")}
        onToggle={toggleSection}
      >
        <div className="space-y-2">
          <NumberField label="Losses Today" value={input.lossesToday} onChange={(v) => update("lossesToday", v)} min={0} />
          <NumberField label="Consec Losses" value={input.consecutiveLosses} onChange={(v) => update("consecutiveLosses", v)} min={0} />
          <NumberField label="Open Positions" value={input.openPositions} onChange={(v) => update("openPositions", v)} min={0} />
          <SelectField
            label="Last Result"
            value={input.lastTradeResult}
            options={[
              { value: "win", label: "Win" },
              { value: "loss", label: "Loss" },
              { value: "none", label: "None" },
            ]}
            onChange={(v) => update("lastTradeResult", v)}
          />
          <NumberField label="Min Since Loss" value={input.timeSinceLastLoss} onChange={(v) => update("timeSinceLastLoss", v)} min={0} />
          <NumberField label="R:R Ratio" value={input.rrRatio} onChange={(v) => update("rrRatio", v)} step={0.1} min={0} />
          <ToggleField label="Manual Block" value={input.manualBlock} onChange={(v) => update("manualBlock", v)} />
        </div>
      </SidebarSection>
    </div>
  );
}
