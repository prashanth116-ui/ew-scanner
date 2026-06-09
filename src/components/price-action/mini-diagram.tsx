interface MiniDiagramProps {
  title: string;
  children: React.ReactNode;
}

export function MiniDiagram({ title, children }: MiniDiagramProps) {
  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#141414] p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#666]">
        {title}
      </div>
      <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-[#a0a0a0] sm:text-sm">
        {children}
      </pre>
    </div>
  );
}
