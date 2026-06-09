import { AlertTriangle } from "lucide-react";

interface MistakeBoxProps {
  children: React.ReactNode;
}

export function MistakeBox({ children }: MistakeBoxProps) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-400" />
        <span className="text-sm font-semibold text-red-400">Mistake to Avoid</span>
      </div>
      <div className="text-sm leading-relaxed text-[#c0c0c0]">{children}</div>
    </div>
  );
}
