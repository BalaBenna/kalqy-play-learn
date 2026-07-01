// Lightweight in-memory + localStorage analytics event bus for KALQY.
// Every game logs events here; dashboards read derived metrics.

export type Skill =
  | "balance"
  | "coordination"
  | "bodyAwareness"
  | "vocabulary"
  | "emotional"
  | "numeracy"
  | "environmental";

export type GameId =
  | "animal-walk"
  | "finger-quiz"
  | "endless-runner"
  | "math-adventure"
  | "voice-quiz"
  | "feeling-pond"
  | "clean-earth"
  | "vocab-face";

export type EventType =
  | "session-start"
  | "session-end"
  | "attempt"
  | "correct"
  | "wrong"
  | "movement"
  | "milestone";

export interface AnalyticsEvent {
  id: string;
  game: GameId;
  type: EventType;
  skill?: Skill;
  value?: number; // e.g. intensity 0..1, jump height, duration ms
  label?: string;
  ts: number;
}

const KEY = "kalqy.events.v1";
const listeners = new Set<() => void>();

function load(): AnalyticsEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function save(events: AnalyticsEvent[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(events.slice(-2000)));
  } catch {
    // ignore quota
  }
}

let cache: AnalyticsEvent[] | null = null;
function all(): AnalyticsEvent[] {
  if (cache === null) cache = load();
  return cache;
}

export function logEvent(e: Omit<AnalyticsEvent, "id" | "ts"> & { ts?: number }) {
  const evt: AnalyticsEvent = {
    id: Math.random().toString(36).slice(2),
    ts: e.ts ?? Date.now(),
    ...e,
  };
  const list = [...all(), evt];
  cache = list;
  save(list);
  listeners.forEach((l) => l());
  return evt;
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getEvents(): AnalyticsEvent[] {
  return all();
}

export function clearEvents() {
  cache = [];
  save([]);
  listeners.forEach((l) => l());
}

// ---------- Selectors ----------

export function getSkillTrend(): Record<Skill, number> {
  const base: Record<Skill, number> = {
    balance: 35,
    coordination: 40,
    bodyAwareness: 30,
    vocabulary: 25,
    emotional: 20,
    numeracy: 25,
    environmental: 20,
  };
  for (const e of all()) {
    if (e.type === "correct" && e.skill) {
      base[e.skill] = Math.min(100, base[e.skill] + 3);
    }
    if (e.type === "movement" && e.skill && e.value) {
      base[e.skill] = Math.min(100, base[e.skill] + e.value * 2);
    }
  }
  return base;
}

export function getUsage(): { game: GameId; sessions: number; minutes: number }[] {
  const map = new Map<GameId, { sessions: number; ms: number }>();
  const starts = new Map<GameId, number>();
  for (const e of all()) {
    if (e.type === "session-start") starts.set(e.game, e.ts);
    if (e.type === "session-end") {
      const s = starts.get(e.game);
      const prev = map.get(e.game) || { sessions: 0, ms: 0 };
      map.set(e.game, {
        sessions: prev.sessions + 1,
        ms: prev.ms + (s ? e.ts - s : 0),
      });
      starts.delete(e.game);
    }
  }
  return Array.from(map.entries()).map(([game, v]) => ({
    game,
    sessions: v.sessions,
    minutes: Math.max(1, Math.round(v.ms / 60000)),
  }));
}

export function getInferences(): string[] {
  const trend = getSkillTrend();
  const usage = getUsage();
  const out: string[] = [];
  const best = (Object.entries(trend) as [Skill, number][]).sort((a, b) => b[1] - a[1])[0];
  const worst = (Object.entries(trend) as [Skill, number][]).sort((a, b) => a[1] - b[1])[0];
  if (best) out.push(`Strongest skill: ${labelSkill(best[0])} (${best[1]}%)`);
  if (worst && worst[1] < 45)
    out.push(`Needs practice: ${labelSkill(worst[0])} — try a related game`);
  const played = new Set(usage.map((u) => u.game));
  const allGames: GameId[] = [
    "animal-walk",
    "finger-quiz",
    "endless-runner",
    "math-adventure",
    "voice-quiz",
    "feeling-pond",
    "clean-earth",
    "vocab-face",
  ];
  const unplayed = allGames.filter((g) => !played.has(g));
  if (unplayed.length) out.push(`Not tried yet: ${unplayed.map(labelGame).slice(0, 2).join(", ")}`);
  return out;
}

export function labelSkill(s: Skill): string {
  return (
    {
      balance: "Balance",
      coordination: "Coordination",
      bodyAwareness: "Body Awareness",
      vocabulary: "Vocabulary",
      emotional: "Emotional Literacy",
      numeracy: "Numeracy",
      environmental: "Environmental Awareness",
    } as const
  )[s];
}

export function labelGame(g: GameId): string {
  return (
    {
      "animal-walk": "Animal Walk",
      "finger-quiz": "Finger Quiz",
      "endless-runner": "Endless Runner",
      "math-adventure": "Math Adventure",
      "voice-quiz": "Say the Word",
      "feeling-pond": "Feeling Pond",
      "clean-earth": "Clean Earth Hero",
      "vocab-face": "Vocab Face Quiz",
    } as const
  )[g];
}
