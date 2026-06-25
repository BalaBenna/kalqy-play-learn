import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sidebar, type View } from "@/components/kalqy/Sidebar";
import { Dashboard, type Stats } from "@/components/kalqy/Dashboard";
import { GameScreen, type GameResult } from "@/components/kalqy/GameScreen";
import { FingerGestureQuiz } from "@/components/kalqy/FingerGestureQuiz";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KALQY — Kinesthetic Learning Platform" },
      {
        name: "description",
        content:
          "Move, play and learn with Kalqy. AI-powered kinesthetic learning games for kids 3–6, aligned with NEP 2020.",
      },
      { property: "og:title", content: "KALQY — Move · Play · Learn" },
      {
        property: "og:description",
        content: "Animal Walk Adventure and more — gross motor games for preschoolers.",
      },
    ],
  }),
  component: Index,
});

const SKILL_MAP: Record<string, keyof Pick<Stats, "balance" | "coordination" | "bodyAwareness">> = {
  Jump: "balance",
  Crawl: "coordination",
  Squat: "bodyAwareness",
  Walk: "coordination",
};

function Index() {
  const [view, setView] = useState<View>("dashboard");
  const [stats, setStats] = useState<Stats>({
    gamesPlayed: 0,
    stars: 0,
    balance: 35,
    coordination: 40,
    bodyAwareness: 30,
  });

  const handleComplete = (result: GameResult) => {
    setStats((prev) => {
      const next = { ...prev };
      next.gamesPlayed += 1;
      next.stars += result.stars;
      // Bump skill scores based on movements practiced
      for (const [movement, count] of Object.entries(result.movements)) {
        const skill = SKILL_MAP[movement];
        if (skill) {
          next[skill] = Math.min(100, next[skill] + count * 6);
        }
      }
      // Small global bump for completing a game
      next.balance = Math.min(100, next.balance + 2);
      next.coordination = Math.min(100, next.coordination + 2);
      next.bodyAwareness = Math.min(100, next.bodyAwareness + 2);
      return next;
    });
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar view={view} onNavigate={setView} />
      <main className="flex-1 overflow-x-hidden">
        {view === "dashboard" && (
          <Dashboard stats={stats} onPlay={() => setView("game")} />
        )}
        {view === "game" && (
          <GameScreen onBack={() => setView("dashboard")} onComplete={handleComplete} />
        )}
        {view === "finger-quiz" && (
          <FingerGestureQuiz
            onBack={() => setView("dashboard")}
            onComplete={(s) =>
              setStats((p) => ({ ...p, gamesPlayed: p.gamesPlayed + 1, stars: p.stars + s }))
            }
          />
        )}
      </main>
    </div>
  );
}
