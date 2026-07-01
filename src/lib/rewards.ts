// Reward engine: Kalqy Coins + Sticker Badges + Milestones.
// Replaces raw numeric scores with child-friendly progression.

import { logEvent, type GameId } from "./analytics";

export interface Sticker {
  id: string;
  name: string;
  emoji: string;
  description: string;
  color: string; // tailwind bg-* token like "sunshine"
}

export const STICKERS: Sticker[] = [
  { id: "first-hop", name: "First Hop", emoji: "🐸", description: "You did your first frog jump!", color: "leaf" },
  { id: "bouncy-bunny", name: "Bouncy Bunny", emoji: "🐰", description: "3 hops in a row!", color: "coral" },
  { id: "power-jumper", name: "Power Jumper", emoji: "💥", description: "A super-high jump!", color: "sunshine" },
  { id: "jungle-master", name: "Jungle Master", emoji: "🌴", description: "Finished all 5 rounds!", color: "jungle" },
  { id: "kind-heart", name: "Kind Heart", emoji: "💖", description: "Named a feeling correctly!", color: "grape" },
  { id: "word-wizard", name: "Word Wizard", emoji: "🪄", description: "Said 3 words right!", color: "sky" },
  { id: "number-ninja", name: "Number Ninja", emoji: "🔢", description: "Solved a math puzzle!", color: "sunshine" },
  { id: "streak-star", name: "Streak Star", emoji: "⭐", description: "Played 3 days in a row!", color: "sunshine" },
  { id: "earth-hero", name: "Earth Hero", emoji: "🌍", description: "Sorted trash like a pro!", color: "leaf" },
];

const KEY = "kalqy.rewards.v1";

interface RewardState {
  coins: number;
  stickers: string[]; // unlocked sticker ids
  streakDays: number;
  lastPlayed: string | null; // YYYY-MM-DD
}

function load(): RewardState {
  if (typeof window === "undefined")
    return { coins: 0, stickers: [], streakDays: 0, lastPlayed: null };
  try {
    return (
      JSON.parse(window.localStorage.getItem(KEY) || "null") || {
        coins: 0,
        stickers: [],
        streakDays: 0,
        lastPlayed: null,
      }
    );
  } catch {
    return { coins: 0, stickers: [], streakDays: 0, lastPlayed: null };
  }
}

function save(s: RewardState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
  listeners.forEach((l) => l());
}

let cache: RewardState | null = null;
const listeners = new Set<() => void>();

export function getRewards(): RewardState {
  if (!cache) cache = load();
  return cache;
}

export function subscribeRewards(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function addCoins(n: number, opts?: { game?: GameId; label?: string }) {
  const s = { ...getRewards() };
  s.coins += n;
  cache = s;
  save(s);
  if (opts?.game) {
    logEvent({ game: opts.game, type: "milestone", value: n, label: opts.label || "coins" });
  }
}

export function unlockSticker(id: string, game?: GameId): Sticker | null {
  const s = { ...getRewards(), stickers: [...getRewards().stickers] };
  if (s.stickers.includes(id)) return null;
  const sticker = STICKERS.find((x) => x.id === id);
  if (!sticker) return null;
  s.stickers.push(id);
  s.coins += 5;
  cache = s;
  save(s);
  if (game) logEvent({ game, type: "milestone", label: `sticker:${id}` });
  return sticker;
}

export function tickStreak() {
  const today = new Date().toISOString().slice(0, 10);
  const s = { ...getRewards() };
  if (s.lastPlayed === today) return;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  s.streakDays = s.lastPlayed === yesterday ? s.streakDays + 1 : 1;
  s.lastPlayed = today;
  cache = s;
  save(s);
  if (s.streakDays >= 3) unlockSticker("streak-star");
}

// Given a jump-height ratio (0..1) return coins earned + optional sticker
export function scoreJumpHeight(h: number): { coins: number; sticker?: string; label: string } {
  if (h >= 0.6) return { coins: 3, sticker: "power-jumper", label: "High jump! +3 coins" };
  if (h >= 0.3) return { coins: 2, label: "Nice hop! +2 coins" };
  return { coins: 1, label: "Little hop +1 coin" };
}
