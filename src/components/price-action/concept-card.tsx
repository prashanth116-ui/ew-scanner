interface ConceptCardProps {
  title: string;
  children: React.ReactNode;
}

export function ConceptCard({ title, children }: ConceptCardProps) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-5">
      <h3 className="mb-3 text-base font-semibold text-white">{title}</h3>
      <div className="space-y-3 text-sm leading-relaxed text-[#c0c0c0]">
        {children}
      </div>
    </div>
  );
}
