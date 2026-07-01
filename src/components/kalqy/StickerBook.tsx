import { useEffect, useState } from "react";
import { ArrowLeft, Coins, Flame } from "lucide-react";
import { STICKERS, getRewards, subscribeRewards } from "@/lib/rewards";

interface Props {
  onBack: () => void;
}

export function StickerBook({ onBack }: Props) {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = subscribeRewards(() => force((n) => n + 1));
    return () => {
      unsub();
    };
  }, []);
  const rewards = getRewards();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-2 rounded-2xl bg-card px-4 py-2 text-sm font-bold text-foreground shadow-sm transition-all hover:scale-105"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <h1 className="mb-2 text-3xl font-black md:text-4xl">🎖️ My Sticker Book</h1>
      <p className="mb-6 text-sm font-semibold text-muted-foreground">
        Collect stickers by playing, moving, and learning!
      </p>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard icon={<Coins className="h-4 w-4" />} label="Kalqy Coins" value={rewards.coins} color="sunshine" />
        <StatCard icon={<Flame className="h-4 w-4" />} label="Day Streak" value={rewards.streakDays} color="coral" />
        <StatCard label="Stickers" value={`${rewards.stickers.length}/${STICKERS.length}`} color="leaf" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {STICKERS.map((s) => {
          const unlocked = rewards.stickers.includes(s.id);
          return (
            <div
              key={s.id}
              className={`rounded-3xl border-2 p-4 text-center transition-all ${
                unlocked
                  ? "border-primary bg-card shadow-lg animate-pop"
                  : "border-dashed border-border bg-muted/40 opacity-60 grayscale"
              }`}
            >
              <div className="mb-2 text-5xl">{unlocked ? s.emoji : "🔒"}</div>
              <div className="text-sm font-black text-foreground">{s.name}</div>
              <div className="mt-1 text-[11px] font-semibold text-muted-foreground">
                {unlocked ? s.description : "Keep playing to unlock"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const colorMap: Record<string, string> = {
  sunshine: "bg-sunshine",
  coral: "bg-coral",
  leaf: "bg-leaf",
};

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-3xl border-2 border-border bg-card p-4 shadow-sm">
      {icon && (
        <div className={`mb-2 grid h-8 w-8 place-items-center rounded-xl ${colorMap[color]}`}>
          {icon}
        </div>
      )}
      <div className="text-2xl font-black">{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
