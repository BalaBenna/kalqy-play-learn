import { Trophy, Star, Activity, Zap, Brain, Play } from "lucide-react";

export interface Stats {
  gamesPlayed: number;
  stars: number;
  balance: number;
  coordination: number;
  bodyAwareness: number;
}

interface DashboardProps {
  stats: Stats;
  onPlay: () => void;
}

export function Dashboard({ stats, onPlay }: DashboardProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      {/* Welcome */}
      <header className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
          Welcome back, little explorer! 🐾
        </h1>
        <p className="mt-1 text-sm font-semibold text-muted-foreground md:text-base">
          Let's move, play, and learn together with Kalqy.
        </p>
      </header>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
        <StatCard label="Games Played" value={stats.gamesPlayed} icon={<Trophy />} color="sunshine" />
        <StatCard label="Stars Earned" value={stats.stars} icon={<Star />} color="coral" />
        <StatCard label="Balance" value={`${stats.balance}%`} icon={<Activity />} color="leaf" />
        <StatCard label="Coordination" value={`${stats.coordination}%`} icon={<Zap />} color="sky" />
        <StatCard label="Body Awareness" value={`${stats.bodyAwareness}%`} icon={<Brain />} color="grape" />
      </div>

      {/* Featured Game */}
      <section className="mt-8">
        <h2 className="mb-3 text-xs font-black uppercase tracking-wider text-muted-foreground">
          Featured Game
        </h2>
        <div className="overflow-hidden rounded-3xl border-2 border-border bg-card shadow-lg">
          <div className="grid gap-0 md:grid-cols-[1fr_1.2fr]">
            {/* Thumbnail */}
            <div className="relative flex min-h-[220px] items-center justify-center overflow-hidden bg-gradient-to-br from-leaf via-jungle to-sky p-8">
              <div className="absolute inset-0 opacity-20">
                <div className="absolute left-4 top-6 text-5xl">🌴</div>
                <div className="absolute right-6 top-10 text-4xl">🌿</div>
                <div className="absolute bottom-4 left-10 text-4xl">🍃</div>
                <div className="absolute bottom-8 right-4 text-5xl">🌳</div>
              </div>
              <div className="relative flex items-center gap-2 text-7xl md:text-8xl">
                <span className="animate-bounce-soft">🐸</span>
                <span className="animate-bounce-soft" style={{ animationDelay: "0.2s" }}>🐰</span>
                <span className="animate-bounce-soft" style={{ animationDelay: "0.4s" }}>🐘</span>
              </div>
            </div>

            {/* Content */}
            <div className="flex flex-col gap-4 p-6 md:p-8">
              <div className="flex flex-wrap gap-2">
                <Badge color="leaf">Gross Motor Development</Badge>
                <Badge color="sunshine">Age 3–4</Badge>
                <Badge color="sky">NEP 2020</Badge>
              </div>
              <h3 className="text-2xl font-black text-foreground md:text-3xl">
                Animal Walk Adventure
              </h3>
              <p className="text-sm font-semibold text-muted-foreground md:text-base">
                Visit the jungle with Kalqy and imitate animals! Hop like a frog, crawl like a rabbit,
                squat like an elephant, and waddle like a duck.
              </p>
              <button
                onClick={onPlay}
                className="group mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-lg font-black text-primary-foreground shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl active:scale-95 md:w-auto md:self-start"
              >
                <Play className="h-5 w-5 fill-current transition-transform group-hover:translate-x-0.5" />
                Play Now
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Progress */}
      <section className="mt-8">
        <h2 className="mb-3 text-xs font-black uppercase tracking-wider text-muted-foreground">
          Recent Activity & Skill Progress
        </h2>
        <div className="grid gap-3 rounded-3xl border-2 border-border bg-card p-6 shadow-sm">
          <SkillBar label="Balance" value={stats.balance} color="leaf" emoji="⚖️" />
          <SkillBar label="Coordination" value={stats.coordination} color="sky" emoji="🤸" />
          <SkillBar label="Body Awareness" value={stats.bodyAwareness} color="grape" emoji="🧘" />
        </div>
      </section>
    </div>
  );
}

const colorMap: Record<string, string> = {
  sunshine: "bg-sunshine",
  coral: "bg-coral",
  leaf: "bg-leaf",
  sky: "bg-sky",
  grape: "bg-grape",
};

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-3xl border-2 border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div
        className={`mb-2 grid h-9 w-9 place-items-center rounded-2xl text-foreground ${colorMap[color]}`}
      >
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      </div>
      <div className="text-2xl font-black text-foreground">{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide text-foreground ${colorMap[color]}`}
    >
      {children}
    </span>
  );
}

function SkillBar({
  label,
  value,
  color,
  emoji,
}: {
  label: string;
  value: number;
  color: string;
  emoji: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm font-bold text-foreground">
        <span className="flex items-center gap-2">
          <span className="text-lg">{emoji}</span>
          {label}
        </span>
        <span className="text-muted-foreground">{value}%</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-700 ${colorMap[color]}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
