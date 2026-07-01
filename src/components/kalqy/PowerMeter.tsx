import { Zap } from "lucide-react";

interface Props {
  value: number; // 0..1
  label?: string;
}

// Vertical energy meter used during Animal Walk to show jump intensity.
export function PowerMeter({ value, label = "Power" }: Props) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const tier = pct > 60 ? "text-jungle" : pct > 30 ? "text-sunshine" : "text-coral";
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-card/90 p-2 shadow-sm backdrop-blur">
      <Zap className={`h-4 w-4 ${tier}`} />
      <div className="relative h-24 w-3 overflow-hidden rounded-full bg-muted">
        <div
          className="absolute bottom-0 left-0 w-full rounded-full bg-gradient-to-t from-coral via-sunshine to-jungle transition-all duration-200"
          style={{ height: `${pct}%` }}
        />
      </div>
      <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
