"use client";

interface NarrativeCardProps {
  narrative: string;
}

export function NarrativeCard({ narrative }: NarrativeCardProps) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[#a0a0a0]">
        Narrative
      </h3>
      <blockquote className="border-l-2 border-[#5ba3e6] pl-4 text-sm leading-relaxed text-[#ccc]">
        {narrative}
      </blockquote>
    </div>
  );
}
