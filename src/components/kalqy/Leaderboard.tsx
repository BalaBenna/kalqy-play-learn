import { useState } from "react";
import { ArrowLeft, Trophy, Flame, Sticker as StickerIcon } from "lucide-react";
import { CLASS_ROSTER } from "@/lib/roles";

interface Props {
  onBack: () => void;
}

type SortKey = "coins" | "stickers" | "streak";

export function Leaderboard({ onBack }: Props) {
  const [sort, setSort] = useState<SortKey>("coins");
  const rows = [...CLASS_ROSTER].sort((a, b) => b[sort] - a[sort]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-2 rounded-2xl bg-card px-4 py-2 text-sm font-bold text-foreground shadow-sm transition-all hover:scale-105"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <h1 className="mb-1 text-3xl font-black md:text-4xl">🏆 Top Explorers of the Week</h1>
      <p className="mb-6 text-sm font-semibold text-muted-foreground">
        Class of Miss Priya · 8 explorers
      </p>

      <div className="mb-4 flex gap-2">
        <SortChip active={sort === "coins"} onClick={() => setSort("coins")} icon={<Trophy className="h-3.5 w-3.5" />}>
          Coins
        </SortChip>
        <SortChip active={sort === "stickers"} onClick={() => setSort("stickers")} icon={<StickerIcon className="h-3.5 w-3.5" />}>
          Stickers
        </SortChip>
        <SortChip active={sort === "streak"} onClick={() => setSort("streak")} icon={<Flame className="h-3.5 w-3.5" />}>
          Streak
        </SortChip>
      </div>

      <div className="overflow-hidden rounded-3xl border-2 border-border bg-card shadow-lg">
        {rows.map((k, i) => (
          <div
            key={k.id}
            className={`flex items-center gap-4 border-b border-border p-4 last:border-0 ${
              i === 0 ? "bg-sunshine/20" : i === 1 ? "bg-sky/10" : i === 2 ? "bg-coral/10" : ""
            }`}
          >
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground text-lg font-black">
              {i + 1}
            </div>
            <div className="text-3xl">{k.avatar}</div>
            <div className="flex-1">
              <div className="text-base font-black">{k.name}</div>
              <div className="text-xs font-semibold text-muted-foreground">
                Top skill: {k.topSkill}
              </div>
            </div>
            <div className="flex gap-4 text-right text-sm">
              <div>
                <div className="font-black text-foreground">{k.coins}</div>
                <div className="text-[10px] uppercase text-muted-foreground">Coins</div>
              </div>
              <div>
                <div className="font-black text-foreground">{k.stickers}</div>
                <div className="text-[10px] uppercase text-muted-foreground">Stickers</div>
              </div>
              <div>
                <div className="font-black text-foreground">{k.streak}🔥</div>
                <div className="text-[10px] uppercase text-muted-foreground">Streak</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SortChip({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-wider transition-all ${
        active ? "bg-primary text-primary-foreground shadow" : "bg-card text-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
