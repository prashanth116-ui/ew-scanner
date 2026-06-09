import { Lightbulb, GraduationCap } from "lucide-react";

interface TakeawayBoxProps {
  level: "beginner" | "advanced";
  children: React.ReactNode;
}

export function TakeawayBox({ level, children }: TakeawayBoxProps) {
  const isBeginner = level === "beginner";

  return (
    <div
      className={`rounded-lg border p-4 ${
        isBeginner
          ? "border-emerald-500/20 bg-emerald-500/5"
          : "border-purple-500/20 bg-purple-500/5"
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        {isBeginner ? (
          <Lightbulb className="h-4 w-4 text-emerald-400" />
        ) : (
          <GraduationCap className="h-4 w-4 text-purple-400" />
        )}
        <span
          className={`text-sm font-semibold ${
            isBeginner ? "text-emerald-400" : "text-purple-400"
          }`}
        >
          {isBeginner ? "Beginner Takeaway" : "Advanced Takeaway"}
        </span>
      </div>
      <div className="text-sm leading-relaxed text-[#c0c0c0]">{children}</div>
    </div>
  );
}
