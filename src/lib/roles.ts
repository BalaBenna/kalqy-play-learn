export type Role = "kid" | "parent" | "teacher";

const KEY = "kalqy.role.v1";

export function getRole(): Role {
  if (typeof window === "undefined") return "kid";
  return (window.localStorage.getItem(KEY) as Role) || "kid";
}

export function setRole(r: Role) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, r);
}

// Mock classroom roster for Teacher view.
export interface RosterKid {
  id: string;
  name: string;
  avatar: string;
  coins: number;
  stickers: number;
  streak: number;
  topSkill: string;
}

export const CLASS_ROSTER: RosterKid[] = [
  { id: "k1", name: "Aarav", avatar: "🦁", coins: 82, stickers: 6, streak: 4, topSkill: "Coordination" },
  { id: "k2", name: "Diya", avatar: "🦋", coins: 71, stickers: 5, streak: 3, topSkill: "Emotional Literacy" },
  { id: "k3", name: "Kabir", avatar: "🐯", coins: 65, stickers: 4, streak: 2, topSkill: "Balance" },
  { id: "k4", name: "Meera", avatar: "🐰", coins: 60, stickers: 4, streak: 5, topSkill: "Vocabulary" },
  { id: "k5", name: "Rohan", avatar: "🐼", coins: 54, stickers: 3, streak: 1, topSkill: "Numeracy" },
  { id: "k6", name: "Sara", avatar: "🦄", coins: 48, stickers: 3, streak: 2, topSkill: "Body Awareness" },
  { id: "k7", name: "Vihaan", avatar: "🐵", coins: 41, stickers: 2, streak: 1, topSkill: "Coordination" },
  { id: "k8", name: "Zara", avatar: "🐨", coins: 35, stickers: 2, streak: 1, topSkill: "Balance" },
];
