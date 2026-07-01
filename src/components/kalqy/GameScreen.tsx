import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RotateCcw, Coins, Volume2 } from "lucide-react";
import { CameraPanel, type CameraMode } from "./CameraPanel";
import { PowerMeter } from "./PowerMeter";
import { logEvent } from "@/lib/analytics";
import { addCoins, scoreJumpHeight, unlockSticker, tickStreak } from "@/lib/rewards";

export interface GameResult {
  stars: number;
  movements: Record<string, number>;
}

interface GameScreenProps {
  onBack: () => void;
  onComplete: (result: GameResult) => void;
}

type Animal = {
  name: string;
  emoji: string;
  movement: string;
  verb: string;
  sound: string; // onomatopoeia
  skill: "balance" | "coordination" | "bodyAwareness";
};

const ANIMALS: Animal[] = [
  { name: "Frog", emoji: "🐸", movement: "Jump", verb: "hop", sound: "Ribbit! Ribbit!", skill: "balance" },
  { name: "Rabbit", emoji: "🐰", movement: "Crawl", verb: "crawl", sound: "Sniff sniff!", skill: "coordination" },
  { name: "Elephant", emoji: "🐘", movement: "Squat", verb: "squat", sound: "Trumpet!", skill: "bodyAwareness" },
  { name: "Duck", emoji: "🦆", movement: "Walk", verb: "waddle", sound: "Quack quack!", skill: "coordination" },
];

// Curiosity ladder — the movement flavor grows each round.
const LADDER = ["a hop", "two hops", "a hop and a clap", "a big high hop", "a hop and a spin"];

const TOTAL_ROUNDS = 5;

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1.2;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

function playTone(freq: number, duration = 0.2, type: OscillatorType = "sine") {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.05);
  } catch {
    // ignore
  }
}

export function GameScreen({ onBack, onComplete }: GameScreenProps) {
  const [phase, setPhase] = useState<"start" | "playing" | "end">("start");
  const [round, setRound] = useState(0);
  const [coins, setCoins] = useState(0);
  const [power, setPower] = useState(0); // 0..1 movement intensity for meter
  const [feedback, setFeedback] = useState<null | { type: "correct" | "wrong"; label?: string }>(null);
  const [confetti, setConfetti] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>("off");
  const [milestone, setMilestone] = useState<string | null>(null);
  const movementsRef = useRef<Record<string, number>>({});
  const streakRef = useRef(0);

  const sequence = useMemo(() => {
    const out: Animal[] = [];
    for (let i = 0; i < TOTAL_ROUNDS; i++) {
      out.push(ANIMALS[Math.floor(Math.random() * ANIMALS.length)]);
    }
    return out;
  }, [phase === "start"]);

  const current = sequence[round];

  useEffect(() => {
    if (phase === "playing" && current) {
      const t = setTimeout(() => {
        speak(`${current.sound} Can you do ${LADDER[round]} like a ${current.name}?`);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [phase, round, current]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      logEvent({ game: "animal-walk", type: "session-end" });
    };
  }, []);

  const start = () => {
    movementsRef.current = {};
    streakRef.current = 0;
    setCoins(0);
    setRound(0);
    setFeedback(null);
    setPower(0);
    setPhase("playing");
    tickStreak();
    logEvent({ game: "animal-walk", type: "session-start" });
  };

  // Called when child picks a card OR camera detects a movement.
  // `intensity` (0..1) is the estimated jump/motion power from CameraPanel.
  const handlePick = (animal: Animal, intensity = 0.35) => {
    if (feedback) return;
    if (animal.name === current.name) {
      const jump = scoreJumpHeight(intensity);
      streakRef.current += 1;
      setCoins((c) => c + jump.coins);
      setPower(intensity);
      movementsRef.current[current.movement] = (movementsRef.current[current.movement] || 0) + 1;
      logEvent({
        game: "animal-walk",
        type: "correct",
        skill: current.skill,
        value: intensity,
        label: current.movement,
      });
      addCoins(jump.coins, { game: "animal-walk", label: current.movement });
      unlockSticker("first-hop", "animal-walk");
      if (streakRef.current >= 3) unlockSticker("bouncy-bunny", "animal-walk");
      if (jump.sticker) unlockSticker(jump.sticker, "animal-walk");

      setFeedback({ type: "correct", label: jump.label });
      setMilestone(jump.label);
      setConfetti(true);
      playTone(880, 0.15);
      setTimeout(() => playTone(1320, 0.2), 120);
      speak(current.sound + " Great job!");
      setTimeout(() => {
        setFeedback(null);
        setConfetti(false);
        setMilestone(null);
        setPower(0);
        if (round + 1 >= TOTAL_ROUNDS) {
          unlockSticker("jungle-master", "animal-walk");
          setPhase("end");
          onComplete({ stars: Math.ceil(coins / 3) + 1, movements: { ...movementsRef.current } });
        } else {
          setRound((r) => r + 1);
        }
      }, 1500);
    } else {
      streakRef.current = 0;
      logEvent({ game: "animal-walk", type: "wrong", label: animal.name });
      setFeedback({ type: "wrong" });
      playTone(220, 0.25, "triangle");
      speak("Try again!");
      setTimeout(() => setFeedback(null), 900);
    }
  };

  return (
    <div className="relative min-h-full overflow-hidden bg-gradient-to-b from-sky/40 via-leaf/30 to-leaf/60">
      <div className="pointer-events-none absolute inset-0 select-none text-5xl opacity-40">
        <div className="absolute left-4 top-6">🌴</div>
        <div className="absolute right-8 top-12">🌿</div>
        <div className="absolute bottom-10 left-12">🌳</div>
        <div className="absolute bottom-6 right-6">🍃</div>
        <div className="absolute left-1/2 top-4">☁️</div>
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6 md:px-8 md:py-8">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => {
              window.speechSynthesis?.cancel();
              onBack();
            }}
            className="flex items-center gap-2 rounded-2xl bg-card/90 px-4 py-2 text-sm font-bold text-foreground shadow-sm backdrop-blur transition-all hover:scale-105 active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          {phase === "playing" && (
            <div className="flex items-center gap-2 rounded-2xl bg-card/90 px-4 py-2 shadow-sm backdrop-blur">
              <span className="text-sm font-black">
                Round {round + 1} / {TOTAL_ROUNDS}
              </span>
              <span className="flex items-center gap-1 text-sm font-black text-sunshine">
                <Coins className="h-4 w-4" /> {coins}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-1 items-center justify-center">
          {phase === "start" && <StartScreen onStart={start} />}
          {phase === "playing" && current && (
            <div className="grid w-full gap-5 md:grid-cols-[1fr_320px] md:items-start">
              <div className="flex gap-3">
                <PlayScreen
                  current={current}
                  feedback={feedback}
                  onPick={(a) => handlePick(a)}
                  milestone={milestone}
                />
                <PowerMeter value={power} label="Jump Power" />
              </div>
              <CameraPanel
                mode={cameraMode}
                onModeChange={setCameraMode}
                active={!feedback}
                onMovementDetected={(intensity?: number) => handlePick(current, intensity ?? 0.5)}
              />
            </div>
          )}
          {phase === "end" && (
            <EndScreen
              coins={coins}
              onPlayAgain={start}
              onBack={() => {
                window.speechSynthesis?.cancel();
                onBack();
              }}
            />
          )}
        </div>

        {/* Round-progress pips (labeled — was the mystery bottom bar) */}
        {phase === "playing" && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              Round Progress
            </span>
            {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
              <span
                key={i}
                className={`h-3 w-6 rounded-full transition-all ${
                  i < round
                    ? "bg-jungle"
                    : i === round
                      ? "bg-sunshine animate-pop"
                      : "bg-muted"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {confetti && <Confetti />}
    </div>
  );
}

function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="animate-pop text-center">
      <div className="mb-6 text-8xl md:text-9xl">
        <span className="inline-block animate-bounce-soft">🦊</span>
      </div>
      <h1 className="mb-2 text-4xl font-black text-foreground drop-shadow-sm md:text-6xl">
        Animal Walk Adventure
      </h1>
      <p className="mb-8 text-lg font-bold text-foreground/80 md:text-xl">
        Move big for more coins! 🪙 High jumps = extra coins.
      </p>
      <button
        onClick={onStart}
        className="rounded-3xl bg-primary px-10 py-5 text-2xl font-black text-primary-foreground shadow-xl transition-all hover:scale-110 hover:rotate-1 active:scale-95 md:text-3xl"
      >
        ▶ Start
      </button>
    </div>
  );
}

function PlayScreen({
  current,
  feedback,
  onPick,
  milestone,
}: {
  current: Animal;
  feedback: null | { type: "correct" | "wrong"; label?: string };
  onPick: (a: Animal) => void;
  milestone: string | null;
}) {
  return (
    <div className="w-full">
      {/* Big animated mascot showing the current animal */}
      <div className="mb-4 flex flex-col items-center text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-card/90 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-muted-foreground shadow-sm backdrop-blur">
          <Volume2 className="h-3 w-3" />
          Listen & Move
        </div>
        <div className="text-8xl md:text-9xl animate-bounce-soft">{current.emoji}</div>
        <div className="text-lg font-black text-jungle mt-1">{current.sound}</div>
        <h2 className="mt-2 text-2xl font-black md:text-4xl">
          {current.verb.charAt(0).toUpperCase() + current.verb.slice(1)} like a {current.name}!
        </h2>
        {feedback?.type === "correct" && (
          <div className="mt-4 animate-pop text-2xl font-black text-jungle">
            🌟 {milestone || "Great job!"} 🌟
          </div>
        )}
        {feedback?.type === "wrong" && (
          <div className="mt-4 animate-pop text-2xl font-black text-coral">🐾 Try again!</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
        {ANIMALS.map((a) => (
          <AnimalCard key={a.name} animal={a} onClick={() => onPick(a)} disabled={!!feedback} />
        ))}
      </div>
    </div>
  );
}

function AnimalCard({
  animal,
  onClick,
  disabled,
}: {
  animal: Animal;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex aspect-square flex-col items-center justify-center gap-2 rounded-3xl border-4 border-card bg-card p-4 shadow-lg transition-all hover:-translate-y-1 hover:rotate-1 hover:border-primary hover:shadow-xl active:scale-95 disabled:opacity-60"
    >
      <div className="text-6xl transition-transform group-hover:scale-110 md:text-7xl">
        {animal.emoji}
      </div>
      <div className="text-base font-black md:text-lg">{animal.name}</div>
      <div className="rounded-full bg-secondary px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-secondary-foreground md:text-xs">
        {animal.movement}
      </div>
    </button>
  );
}

function EndScreen({
  coins,
  onPlayAgain,
  onBack,
}: {
  coins: number;
  onPlayAgain: () => void;
  onBack: () => void;
}) {
  return (
    <div className="animate-pop text-center">
      <div className="mb-4 text-7xl">🎉</div>
      <h1 className="mb-2 text-4xl font-black md:text-6xl">You did it!</h1>
      <p className="mb-6 text-lg font-bold text-foreground/80">Jungle superstar unlocked! 🌴</p>

      <div className="mb-8 flex items-center justify-center gap-3">
        <div className="rounded-3xl bg-sunshine px-6 py-4 shadow-lg">
          <div className="flex items-center gap-2 text-3xl font-black">
            <Coins className="h-8 w-8" /> +{coins}
          </div>
          <div className="text-[11px] font-black uppercase tracking-wider">Coins earned</div>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          onClick={onPlayAgain}
          className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-lg font-black text-primary-foreground shadow-lg transition-all hover:scale-105 active:scale-95"
        >
          <RotateCcw className="h-4 w-4" /> Play Again
        </button>
        <button
          onClick={onBack}
          className="rounded-2xl bg-card px-6 py-3 text-lg font-black shadow-lg transition-all hover:scale-105 active:scale-95"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 40 });
  const colors = ["#f97316", "#facc15", "#22c55e", "#38bdf8", "#a855f7", "#ef4444"];
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.3;
        const duration = 1.2 + Math.random() * 0.8;
        const color = colors[i % colors.length];
        const size = 6 + Math.random() * 8;
        return (
          <div
            key={i}
            style={{
              left: `${left}%`,
              top: "-10vh",
              width: size,
              height: size,
              background: color,
              animation: `confetti-fall ${duration}s ${delay}s linear forwards`,
              borderRadius: i % 3 === 0 ? "50%" : "2px",
            }}
            className="absolute"
          />
        );
      })}
    </div>
  );
}
