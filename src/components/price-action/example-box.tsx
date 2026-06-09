import { TrendingUp } from "lucide-react";

interface ExampleBoxProps {
  symbol?: string;
  title: string;
  children: React.ReactNode;
}

export function ExampleBox({ symbol, title, children }: ExampleBoxProps) {
  return (
    <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-sky-400" />
        <span className="text-sm font-semibold text-sky-400">
          {symbol ? `${symbol} Example` : "Example Read"}: {title}
        </span>
      </div>
      <div className="text-sm leading-relaxed text-[#c0c0c0]">{children}</div>
    </div>
  );
}
