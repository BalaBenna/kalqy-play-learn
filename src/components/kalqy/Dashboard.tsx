import { useEffect, useState } from "react";
import { Trophy, Star, Activity, Zap, Brain, Play, Coins, Flame, Heart, BookOpen, Sigma } from "lucide-react";
import type { Role } from "@/lib/roles";
import { CLASS_ROSTER } from "@/lib/roles";
import { getRewards, subscribeRewards, STICKERS } from "@/lib/rewards";
import { getSkillTrend, getUsage, getInferences, labelGame, labelSkill, type Skill } from "@/lib/analytics";

export interface Stats {
  gamesPlayed: number;
  stars: number;
  balance: number;
  coordination: number;
  bodyAwareness: number;
}

interface DashboardProps {
  role: Role;
  stats: Stats;
  onPlay: () => void;
  onOpenStickers?: () => void;
  onOpenLeaderboard?: () => void;
}

export function Dashboard({ role, stats, onPlay, onOpenStickers, onOpenLeaderboard }: DashboardProps) {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = subscribeRewards(() => force((n) => n + 1));
    return () => {
      unsub();
    };
  }, []);
  const rewards = getRewards();
  const trend = getSkillTrend();
  const usage = getUsage();
  const inferences = getInferences();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <header className="mb-6">
        <div className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
          {role === "kid" ? "Kid View" : role === "parent" ? "Parent View" : "Teacher View"}
        </div>
        <h1 className="text-3xl font-black tracking-tight md:text-4xl">
          {role === "kid" && "Welcome back, little explorer! 🐾"}
          {role === "parent" && "Your child's learning journey"}
          {role === "teacher" && "Classroom overview"}
        </h1>
        <p className="mt-1 text-sm font-semibold text-muted-foreground md:text-base">
          {role === "kid" && "Let's move, play, and learn together with Kalqy."}
          {role === "parent" && "Skills, milestones, and time spent this week."}
          {role === "teacher" && "Class of Miss Priya · 8 explorers · NEP Foundational Stage."}
        </p>
      </header>

      {/* Reward strip — always visible */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Kalqy Coins" value={rewards.coins} icon={<Coins />} color="sunshine" />
        <StatCard label="Stickers" value={`${rewards.stickers.length}/${STICKERS.length}`} icon={<Star />} color="coral" onClick={onOpenStickers} />
        <StatCard label="Day Streak" value={`${rewards.streakDays}🔥`} icon={<Flame />} color="coral" />
        <StatCard label="Games Played" value={stats.gamesPlayed} icon={<Trophy />} color="leaf" />
      </div>

      {role === "kid" && (
        <KidView stats={stats} onPlay={onPlay} rewards={rewards} />
      )}

      {role === "parent" && (
        <ParentView trend={trend} usage={usage} inferences={inferences} />
      )}

      {role === "teacher" && (
        <TeacherView trend={trend} inferences={inferences} onOpenLeaderboard={onOpenLeaderboard} />
      )}
    </div>
  );
}

// ---------- KID ----------

function KidView({ stats, onPlay, rewards }: { stats: Stats; onPlay: () => void; rewards: ReturnType<typeof getRewards> }) {
  const nextSticker = STICKERS.find((s) => !rewards.stickers.includes(s.id));
  return (
    <>
      <section className="mt-2">
        <h2 className="mb-3 text-xs font-black uppercase tracking-wider text-muted-foreground">
          Featured Game
        </h2>
        <div className="overflow-hidden rounded-3xl border-2 border-border bg-card shadow-lg">
          <div className="grid gap-0 md:grid-cols-[1fr_1.2fr]">
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
            <div className="flex flex-col gap-4 p-6 md:p-8">
              <div className="flex flex-wrap gap-2">
                <Badge color="leaf">Gross Motor</Badge>
                <Badge color="sunshine">Age 3–4</Badge>
                <Badge color="sky">NEP 2020</Badge>
              </div>
              <h3 className="text-2xl font-black md:text-3xl">Animal Walk Adventure</h3>
              <p className="text-sm font-semibold text-muted-foreground md:text-base">
                Hop, crawl, squat and waddle with Kalqy — earn coins for high-power moves!
              </p>
              <button
                onClick={onPlay}
                className="group mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-lg font-black text-primary-foreground shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl active:scale-95 md:w-auto md:self-start"
              >
                <Play className="h-5 w-5 fill-current" /> Play Now
              </button>
            </div>
          </div>
        </div>
      </section>

      {nextSticker && (
        <section className="mt-6 rounded-3xl border-2 border-dashed border-primary/50 bg-card p-5 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
            Next Milestone
          </div>
          <div className="mt-1 flex items-center gap-4">
            <div className="text-5xl grayscale">{nextSticker.emoji}</div>
            <div>
              <div className="text-lg font-black">{nextSticker.name}</div>
              <div className="text-sm font-semibold text-muted-foreground">
                {nextSticker.description}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-black uppercase tracking-wider text-muted-foreground">
          My Skills
        </h2>
        <div className="grid gap-3 rounded-3xl border-2 border-border bg-card p-6 shadow-sm">
          <SkillBar label="Balance" value={stats.balance} color="leaf" emoji="⚖️" />
          <SkillBar label="Coordination" value={stats.coordination} color="sky" emoji="🤸" />
          <SkillBar label="Body Awareness" value={stats.bodyAwareness} color="grape" emoji="🧘" />
        </div>
      </section>
    </>
  );
}

// ---------- PARENT ----------

function ParentView({
  trend,
  usage,
  inferences,
}: {
  trend: Record<Skill, number>;
  usage: ReturnType<typeof getUsage>;
  inferences: string[];
}) {
  return (
    <>
      <section className="mt-2 grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border-2 border-border bg-card p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-black uppercase tracking-wider text-muted-foreground">
            NEP Competency Skills
          </h3>
          <div className="grid gap-3">
            {(Object.entries(trend) as [Skill, number][]).map(([s, v]) => (
              <SkillBar key={s} label={labelSkill(s)} value={v} color={skillColor(s)} emoji={skillEmoji(s)} />
            ))}
          </div>
        </div>

        <div className="rounded-3xl border-2 border-border bg-card p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-black uppercase tracking-wider text-muted-foreground">
            Time by Game (this week)
          </h3>
          {usage.length === 0 && (
            <p className="text-sm italic text-muted-foreground">No sessions logged yet.</p>
          )}
          <div className="flex flex-col gap-2">
            {usage.map((u) => (
              <div key={u.game} className="flex items-center gap-3">
                <div className="w-32 truncate text-sm font-bold">{labelGame(u.game)}</div>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(100, u.minutes * 8)}%` }}
                  />
                </div>
                <div className="w-16 text-right text-xs font-semibold text-muted-foreground">
                  {u.minutes}m · {u.sessions}×
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border-2 border-border bg-card p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-black uppercase tracking-wider text-muted-foreground">
          Insights
        </h3>
        {inferences.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">Play a few games to unlock insights.</p>
        ) : (
          <ul className="grid gap-2">
            {inferences.map((i, idx) => (
              <li key={idx} className="rounded-2xl bg-secondary/40 px-4 py-2.5 text-sm font-semibold">
                💡 {i}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ---------- TEACHER ----------

function TeacherView({
  trend,
  inferences,
  onOpenLeaderboard,
}: {
  trend: Record<Skill, number>;
  inferences: string[];
  onOpenLeaderboard?: () => void;
}) {
  const top3 = [...CLASS_ROSTER].sort((a, b) => b.coins - a.coins).slice(0, 3);
  return (
    <>
      <section className="mt-2 grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border-2 border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-wider text-muted-foreground">
              🏆 Top Explorers
            </h3>
            <button
              onClick={onOpenLeaderboard}
              className="rounded-full bg-primary px-3 py-1 text-xs font-black text-primary-foreground shadow"
            >
              Full Leaderboard →
            </button>
          </div>
          <div className="grid gap-3">
            {top3.map((k, i) => (
              <div key={k.id} className="flex items-center gap-3 rounded-2xl bg-secondary/30 p-3">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground font-black">
                  {i + 1}
                </div>
                <div className="text-2xl">{k.avatar}</div>
                <div className="flex-1">
                  <div className="text-sm font-black">{k.name}</div>
                  <div className="text-xs text-muted-foreground">{k.topSkill}</div>
                </div>
                <div className="text-sm font-black text-foreground">{k.coins} 🪙</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border-2 border-border bg-card p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-black uppercase tracking-wider text-muted-foreground">
            Class NEP Coverage
          </h3>
          <div className="grid gap-3">
            {(Object.entries(trend) as [Skill, number][]).map(([s, v]) => (
              <SkillBar key={s} label={labelSkill(s)} value={v} color={skillColor(s)} emoji={skillEmoji(s)} />
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border-2 border-border bg-card p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-black uppercase tracking-wider text-muted-foreground">
          Auto-Inferences
        </h3>
        {inferences.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">Play games to generate insights.</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {inferences.map((i, idx) => (
              <li key={idx} className="rounded-2xl bg-secondary/40 px-4 py-2.5 text-sm font-semibold">
                💡 {i}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ---------- shared ----------

const colorMap: Record<string, string> = {
  sunshine: "bg-sunshine",
  coral: "bg-coral",
  leaf: "bg-leaf",
  sky: "bg-sky",
  grape: "bg-grape",
};

function skillColor(s: Skill): string {
  return (
    {
      balance: "leaf",
      coordination: "sky",
      bodyAwareness: "grape",
      vocabulary: "sunshine",
      emotional: "coral",
      numeracy: "sunshine",
      environmental: "leaf",
    } as const
  )[s];
}
function skillEmoji(s: Skill): string {
  return ({ balance: "⚖️", coordination: "🤸", bodyAwareness: "🧘", vocabulary: "🔤", emotional: "💖", numeracy: "🔢", environmental: "🌍" } as const)[s];
}

function StatCard({
  label,
  value,
  icon,
  color,
  onClick,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color: string;
  onClick?: () => void;
}) {
  const Wrapper: any = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={`rounded-3xl border-2 border-border bg-card p-4 text-left shadow-sm transition-all ${
        onClick ? "hover:-translate-y-0.5 hover:shadow-md cursor-pointer" : ""
      }`}
    >
      {icon && (
        <div className={`mb-2 grid h-9 w-9 place-items-center rounded-2xl ${colorMap[color]}`}>
          <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        </div>
      )}
      <div className="text-2xl font-black">{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </Wrapper>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide text-foreground ${colorMap[color]}`}>
      {children}
    </span>
  );
}

function SkillBar({ label, value, color, emoji }: { label: string; value: number; color: string; emoji: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm font-bold">
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
